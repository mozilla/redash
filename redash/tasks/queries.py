import logging
import signal
import time
import datetime

import redis
from celery import group
from celery.exceptions import SoftTimeLimitExceeded, TimeLimitExceeded
from celery.result import AsyncResult
from celery.utils.log import get_task_logger
from dateutil import parser
from six import text_type
from sqlalchemy.orm import load_only
from sqlalchemy import or_

from redash import models, redis_connection, schema, settings, statsd_client, utils
from redash.models import TableMetadata, ColumnMetadata, db
from redash.models.parameterized_query import InvalidParameterError, QueryDetachedFromDataSourceError
from redash.query_runner import InterruptException, NotSupported
from redash.tasks.alerts import check_alerts_for_query
from redash.tasks.failure_report import notify_of_failure
from redash.utils import gen_query_hash, json_dumps, utcnow, mustache_render
from redash.worker import celery

logger = get_task_logger(__name__)
TIMEOUT_MESSAGE = "Query exceeded Redash query execution time limit."


def _job_lock_id(query_hash, data_source_id):
    return "query_hash_job:%s:%s" % (data_source_id, query_hash)


def _unlock(query_hash, data_source_id):
    redis_connection.delete(_job_lock_id(query_hash, data_source_id))


class QueryTask(object):
    # TODO: this is mapping to the old Job class statuses. Need to update the client side and remove this
    STATUSES = {
        'PENDING': 1,
        'STARTED': 2,
        'SUCCESS': 3,
        'FAILURE': 4,
        'REVOKED': 4
    }

    def __init__(self, job_id=None, async_result=None):
        if async_result:
            self._async_result = async_result
        else:
            self._async_result = AsyncResult(job_id, app=celery)

    @property
    def id(self):
        return self._async_result.id

    def to_dict(self):
        task_info = self._async_result._get_task_meta()
        result, task_status = task_info['result'], task_info['status']
        if task_status == 'STARTED':
            updated_at = result.get('start_time', 0)
        else:
            updated_at = 0

        status = self.STATUSES[task_status]

        if isinstance(result, (TimeLimitExceeded, SoftTimeLimitExceeded)):
            error = TIMEOUT_MESSAGE
            status = 4
        elif isinstance(result, Exception):
            error = result.message
            status = 4
        elif task_status == 'REVOKED':
            error = 'Query execution cancelled.'
        else:
            error = ''

        if task_status == 'SUCCESS' and not error:
            query_result_id = result
        else:
            query_result_id = None

        return {
            'id': self._async_result.id,
            'updated_at': updated_at,
            'status': status,
            'error': error,
            'query_result_id': query_result_id,
        }

    @property
    def is_cancelled(self):
        return self._async_result.status == 'REVOKED'

    @property
    def celery_status(self):
        return self._async_result.status

    def ready(self):
        return self._async_result.ready()

    def cancel(self):
        return self._async_result.revoke(terminate=True, signal='SIGINT')


def enqueue_query(query, data_source, user_id, is_api_key=False, scheduled_query=None, metadata={}):
    query_hash = gen_query_hash(query)
    logging.info("Inserting job for %s with metadata=%s", query_hash, metadata)
    try_count = 0
    job = None

    while try_count < 5:
        try_count += 1

        pipe = redis_connection.pipeline()
        try:
            pipe.watch(_job_lock_id(query_hash, data_source.id))
            job_id = pipe.get(_job_lock_id(query_hash, data_source.id))
            if job_id:
                logging.info("[%s] Found existing job: %s", query_hash, job_id)

                job = QueryTask(job_id=job_id)

                if job.ready():
                    logging.info("[%s] job found is ready (%s), removing lock", query_hash, job.celery_status)
                    redis_connection.delete(_job_lock_id(query_hash, data_source.id))
                    job = None

            if not job:
                pipe.multi()

                if scheduled_query:
                    queue_name = data_source.scheduled_queue_name
                    scheduled_query_id = scheduled_query.id
                else:
                    queue_name = data_source.queue_name
                    scheduled_query_id = None

                args = (query, data_source.id, metadata, user_id, scheduled_query_id, is_api_key)
                argsrepr = json_dumps({
                    'org_id': data_source.org_id,
                    'data_source_id': data_source.id,
                    'enqueue_time': time.time(),
                    'scheduled': scheduled_query_id is not None,
                    'query_id': metadata.get('Query ID'),
                    'user_id': user_id
                })

                time_limit = settings.dynamic_settings.query_time_limit(scheduled_query, user_id, data_source.org_id)

                result = execute_query.apply_async(args=args,
                                                   argsrepr=argsrepr,
                                                   queue=queue_name,
                                                   soft_time_limit=time_limit)

                job = QueryTask(async_result=result)
                logging.info("[%s] Created new job: %s", query_hash, job.id)
                pipe.set(_job_lock_id(query_hash, data_source.id), job.id, settings.JOB_EXPIRY_TIME)
                pipe.execute()
            break

        except redis.WatchError:
            continue

    if not job:
        logging.error("[Manager][%s] Failed adding job for query.", query_hash)

    return job


@celery.task(name="redash.tasks.empty_schedules")
def empty_schedules():
    logger.info("Deleting schedules of past scheduled queries...")

    queries = models.Query.past_scheduled_queries()
    for query in queries:
        query.schedule = None
    models.db.session.commit()

    logger.info("Deleted %d schedules.", len(queries))


@celery.task(name="redash.tasks.refresh_queries")
def refresh_queries():
    logger.info("Refreshing queries...")

    outdated_queries_count = 0
    query_ids = []

    with statsd_client.timer('manager.outdated_queries_lookup'):
        for query in models.Query.outdated_queries():
            if settings.FEATURE_DISABLE_REFRESH_QUERIES:
                logging.info("Disabled refresh queries.")
            elif query.org.is_disabled:
                logging.debug("Skipping refresh of %s because org is disabled.", query.id)
            elif query.data_source is None:
                logging.debug("Skipping refresh of %s because the datasource is none.", query.id)
            elif query.data_source.paused:
                logging.debug("Skipping refresh of %s because datasource - %s is paused (%s).",
                              query.id, query.data_source.name, query.data_source.pause_reason)
            else:
                query_text = query.query_text

                parameters = {p['name']: p.get('value') for p in query.parameters}
                if any(parameters):
                    try:
                        query_text = query.parameterized.apply(parameters).query
                    except InvalidParameterError as e:
                        error = u"Skipping refresh of {} because of invalid parameters: {}".format(query.id, e.message)
                        track_failure(query, error)
                        continue
                    except QueryDetachedFromDataSourceError as e:
                        error = ("Skipping refresh of {} because a related dropdown "
                                 "query ({}) is unattached to any datasource.").format(query.id, e.query_id)
                        track_failure(query, error)
                        continue

                enqueue_query(query_text, query.data_source, query.user_id,
                              scheduled_query=query,
                              metadata={'Query ID': query.id, 'Username': 'Scheduled'})

                query_ids.append(query.id)
                outdated_queries_count += 1

    statsd_client.gauge('manager.outdated_queries', outdated_queries_count)

    logger.info("Done refreshing queries. Found %d outdated queries: %s" % (outdated_queries_count, query_ids))

    status = redis_connection.hgetall('redash:status')
    now = time.time()

    redis_connection.hmset('redash:status', {
        'outdated_queries_count': outdated_queries_count,
        'last_refresh_at': now,
        'query_ids': json_dumps(query_ids)
    })

    statsd_client.gauge('manager.seconds_since_refresh', now - float(status.get('last_refresh_at', now)))


@celery.task(name="redash.tasks.cleanup_query_results")
def cleanup_query_results():
    """
    Job to cleanup unused query results -- such that no query links to them anymore, and older than
    settings.QUERY_RESULTS_MAX_AGE (a week by default, so it's less likely to be open in someone's browser and be used).

    Each time the job deletes only settings.QUERY_RESULTS_CLEANUP_COUNT (100 by default) query results so it won't choke
    the database in case of many such results.
    """

    logging.info("Running query results clean up (removing maximum of %d unused results, that are %d days old or more)",
                 settings.QUERY_RESULTS_CLEANUP_COUNT, settings.QUERY_RESULTS_CLEANUP_MAX_AGE)

    unused_query_results = models.QueryResult.unused(settings.QUERY_RESULTS_CLEANUP_MAX_AGE).limit(settings.QUERY_RESULTS_CLEANUP_COUNT)
    deleted_count = models.QueryResult.query.filter(
        models.QueryResult.id.in_(unused_query_results.subquery())
    ).delete(synchronize_session=False)
    deleted_count += models.Query.delete_stale_resultsets()
    models.db.session.commit()
    logger.info("Deleted %d unused query results.", deleted_count)


def truncate_long_string(original_str, max_length):
    # Remove null characters so we can save as string to postgres
    new_str = original_str.replace('\x00', '')

    if new_str and len(new_str) > max_length:
        new_str = u'{}...'.format(new_str[:max_length])
    return new_str


@celery.task(name="redash.tasks.update_sample")
def update_sample(data_source_id, table_name, table_id, sample_updated_at):
    """
    For a given table, look up a sample row for it and update
    the "example" fields for it in the column_metadata table.
    """
    logger.info(u"task=update_sample state=start table_name=%s", table_name)
    start_time = time.time()
    ds = models.DataSource.get_by_id(data_source_id)

    persisted_columns = ColumnMetadata.query.filter(
        ColumnMetadata.exists.is_(True),
        ColumnMetadata.table_id == table_id,
    ).options(load_only('id', 'name', 'example'))

    DAYS_AGO = (
        utils.utcnow() - datetime.timedelta(days=settings.SCHEMA_SAMPLE_UPDATE_FREQUENCY_DAYS))

    first_column = persisted_columns.first()

    if (first_column and
        sample_updated_at and
        first_column.example and
        parser.parse(sample_updated_at) > DAYS_AGO):
        # Look at the first example in the persisted columns.
        # If this is *not* empty AND sample_updated_at is recent, don't update sample
        logger.info(u"task=update_sample state=abort - recent sample exists table_name=%s",
                table_name)
        return

    sample = None
    try:
        sample = ds.query_runner.get_table_sample(table_name)
    except NotSupported:
        logger.info(u"Unable to fetch samples for {}".format(table_name))

    if not sample:
        return

    #  If a column exists, add a sample to it.
    column_examples = []
    for persisted_column in persisted_columns.all():
        column_example = sample.get(persisted_column.name, None)
        column_example = column_example if isinstance(
            column_example, unicode) else str(column_example)  # noqa: F821
        column_example = truncate_long_string(column_example, 4000)

        column_examples.append({
            "id": persisted_column.id,
            "example": column_example
        })

    models.db.session.bulk_update_mappings(
        ColumnMetadata,
        column_examples
    )
    models.db.session.commit()
    logger.info(u"task=update_sample state=finished table_name=%s runtime=%.2f",
                table_name, time.time() - start_time)


@celery.task(name="redash.tasks.refresh_samples")
def refresh_samples(data_source_id, table_sample_limit):
    """
    For a given data source, refresh the data samples stored for each
    table. This is done for tables with no samples or samples older
    than DAYS_AGO
    """
    logger.info(u"task=refresh_samples state=start ds_id=%s", data_source_id)
    ds = models.DataSource.get_by_id(data_source_id)

    if not ds.query_runner.configuration.get('samples', False):
        return

    DAYS_AGO = (
        utils.utcnow() - datetime.timedelta(days=settings.SCHEMA_SAMPLE_REFRESH_FREQUENCY_DAYS))

    # Find all existing tables that have an empty or old sample_updated_at
    tables_to_sample = TableMetadata.query.filter(
        TableMetadata.exists.is_(True),
        TableMetadata.data_source_id == data_source_id,
        or_(
            TableMetadata.sample_updated_at.is_(None),
            TableMetadata.sample_updated_at < DAYS_AGO
        )
    ).limit(table_sample_limit).all()

    tasks = []
    for table in tables_to_sample:
        tasks.append(
            update_sample.signature(
                args=(ds.id, table.name, table.id, table.sample_updated_at),
                queue=settings.SCHEMAS_REFRESH_QUEUE
            )
        )
        table.sample_updated_at = db.func.now()
        models.db.session.add(table)

    group(tasks).apply_async()
    models.db.session.commit()


@celery.task(name="redash.tasks.cleanup_schema_metadata")
def cleanup_schema_metadata():
    schema.cleanup_data_in_table(TableMetadata)
    schema.cleanup_data_in_table(ColumnMetadata)


REFRESH_SCHEMA_TIME_LIMIT = 1500

@celery.task(name="redash.tasks.refresh_schema", time_limit=REFRESH_SCHEMA_TIME_LIMIT, soft_time_limit=1200)
def refresh_schema(data_source_id, max_type_string_length=250):
    ds = models.DataSource.get_by_id(data_source_id)
    logger.info(u"task=refresh_schema state=start ds_id=%s", ds.id)
    lock_key = "data_source:schema:refresh:{}:lock".format(data_source_id)
    lock = redis_connection.lock(
        lock_key,
        timeout=REFRESH_SCHEMA_TIME_LIMIT,
    )
    acquired = lock.acquire(blocking=False)
    start_time = time.time()

    if acquired:
        logger.info(u"task=refresh_schema state=locked ds_id=%s", ds.id)
        try:
            # Stores data from the updated schema that tells us which
            # columns and which tables currently exist
            existing_tables_set = set()
            existing_columns_set = set()

            # Stores data that will be inserted into postgres
            table_data = {}
            column_data = {}

            new_column_names = {}
            new_column_metadata = {}

            for table in ds.query_runner.get_schema(get_stats=True):
                table_name = table['name']
                existing_tables_set.add(table_name)

                table_data[table_name] = {
                    'org_id': ds.org_id,
                    'name': table_name,
                    'data_source_id': ds.id,
                    'column_metadata': "metadata" in table,
                    'exists': True
                }
                new_column_names[table_name] = table['columns']
                new_column_metadata[table_name] = table.get('metadata', None)

            schema.insert_or_update_table_metadata(ds, existing_tables_set, table_data)
            models.db.session.commit()

            all_existing_persisted_tables = TableMetadata.query.filter(
                TableMetadata.exists.is_(True),
                TableMetadata.data_source_id == ds.id,
            ).all()

            for table in all_existing_persisted_tables:
                for i, column in enumerate(new_column_names.get(table.name, [])):
                    existing_columns_set.add(column)
                    column_data[column] = {
                        'org_id': ds.org_id,
                        'table_id': table.id,
                        'name': column,
                        'type': None,
                        'exists': True
                    }

                    if table.column_metadata:
                        column_type = new_column_metadata[table.name][i]['type']
                        column_type = truncate_long_string(column_type, max_type_string_length)
                        column_data[column]['type'] = column_type

                schema.insert_or_update_column_metadata(table, existing_columns_set, column_data)
                models.db.session.commit()

                existing_columns_list = list(existing_columns_set)

                # If a column did not exist, set the 'column_exists' flag to false.
                ColumnMetadata.query.filter(
                    ColumnMetadata.exists.is_(True),
                    ColumnMetadata.table_id == table.id,
                    ~ColumnMetadata.name.in_(existing_columns_list),
                ).update({
                    "exists": False,
                    "updated_at": db.func.now()
                }, synchronize_session='fetch')

                # Clear the set for the next round
                existing_columns_set.clear()

            # If a table did not exist in the get_schema() response above,
            # set the 'exists' flag to false.
            existing_tables_list = list(existing_tables_set)
            TableMetadata.query.filter(
                TableMetadata.exists.is_(True),
                TableMetadata.data_source_id == ds.id,
                ~TableMetadata.name.in_(existing_tables_list)
            ).update({
                "exists": False,
                "updated_at": db.func.now()
            }, synchronize_session='fetch')

            models.db.session.commit()

            logger.info(u"task=refresh_schema state=caching ds_id=%s", ds.id)
            schema.SchemaCache(ds).populate(forced=True)
            logger.info(u"task=refresh_schema state=cached ds_id=%s", ds.id)

            logger.info(u"task=refresh_schema state=finished ds_id=%s runtime=%.2f", ds.id, time.time() - start_time)
            statsd_client.incr('refresh_schema.success')
        except SoftTimeLimitExceeded:
            logger.info(u"task=refresh_schema state=timeout ds_id=%s runtime=%.2f", ds.id, time.time() - start_time)
            statsd_client.incr('refresh_schema.timeout')
        except Exception:
            logger.warning(u"Failed refreshing schema for the data source: %s", ds.name, exc_info=1)
            statsd_client.incr('refresh_schema.error')
            logger.info(u"task=refresh_schema state=failed ds_id=%s runtime=%.2f", ds.id, time.time() - start_time)
        finally:
            lock.release()
            logger.info(u"task=refresh_schema state=unlocked ds_id=%s", ds.id)
    else:
        logger.info(u"task=refresh_schema state=alreadylocked ds_id=%s", ds.id)


@celery.task(name="redash.tasks.refresh_schemas")
def refresh_schemas():
    """
    Refreshes the data sources schemas.
    """
    TABLE_SAMPLE_LIMIT = 50
    blacklist = [int(ds_id) for ds_id in redis_connection.smembers('data_sources:schema:blacklist') if ds_id]
    global_start_time = time.time()

    logger.info(u"task=refresh_schemas state=start")

    for ds in models.DataSource.query:
        if ds.paused:
            logger.info(u"task=refresh_schema state=skip ds_id=%s reason=paused(%s)", ds.id, ds.pause_reason)
        elif ds.id in blacklist:
            logger.info(u"task=refresh_schema state=skip ds_id=%s reason=blacklist", ds.id)
        elif ds.org.is_disabled:
            logger.info(u"task=refresh_schema state=skip ds_id=%s reason=org_disabled", ds.id)
        else:
            refresh_schema.apply_async(args=(ds.id,), queue=settings.SCHEMAS_REFRESH_QUEUE)
            refresh_samples.apply_async(args=(ds.id, TABLE_SAMPLE_LIMIT), queue=settings.SAMPLES_REFRESH_QUEUE)

    logger.info(u"task=refresh_schemas state=finish total_runtime=%.2f", time.time() - global_start_time)


def signal_handler(*args):
    raise InterruptException


class QueryExecutionError(Exception):
    pass


def _resolve_user(user_id, is_api_key, query_id):
    if user_id is not None:
        if is_api_key:
            api_key = user_id
            if query_id is not None:
                q = models.Query.get_by_id(query_id)
            else:
                q = models.Query.by_api_key(api_key)

            return models.ApiUser(api_key, q.org, q.groups)
        else:
            return models.User.get_by_id(user_id)
    else:
        return None


def track_failure(query, error):
    logging.debug(error)

    query.schedule_failures += 1
    models.db.session.add(query)
    models.db.session.commit()

    notify_of_failure(error, query)


# We could have created this as a celery.Task derived class, and act as the task itself. But this might result in weird
# issues as the task class created once per process, so decided to have a plain object instead.
class QueryExecutor(object):
    def __init__(self, task, query, data_source_id, user_id, is_api_key, metadata,
                 scheduled_query):
        self.task = task
        self.query = query
        self.data_source_id = data_source_id
        self.metadata = metadata
        self.data_source = self._load_data_source()
        self.user = _resolve_user(user_id, is_api_key, metadata.get('Query ID'))

        # Close DB connection to prevent holding a connection for a long time while the query is executing.
        models.db.session.close()
        self.query_hash = gen_query_hash(self.query)
        self.scheduled_query = scheduled_query
        # Load existing tracker or create a new one if the job was created before code update:
        if scheduled_query:
            models.scheduled_queries_executions.update(scheduled_query.id)

    def run(self):
        signal.signal(signal.SIGINT, signal_handler)
        started_at = time.time()

        logger.debug("Executing query:\n%s", self.query)
        self._log_progress('executing_query')

        query_runner = self.data_source.query_runner
        annotated_query = self._annotate_query(query_runner)

        try:
            data, error = query_runner.run_query(annotated_query, self.user)
        except Exception as e:
            if isinstance(e, SoftTimeLimitExceeded):
                error = TIMEOUT_MESSAGE
            else:
                error = text_type(e)

            data = None
            logging.warning('Unexpected error while running query:', exc_info=1)

        run_time = time.time() - started_at

        logger.info(u"task=execute_query query_hash=%s data_length=%s error=[%s]", self.query_hash, data and len(data), error)

        _unlock(self.query_hash, self.data_source.id)

        if error is not None and data is None:
            result = QueryExecutionError(error)
            if self.scheduled_query is not None:
                self.scheduled_query = models.db.session.merge(self.scheduled_query, load=False)
                track_failure(self.scheduled_query, error)
            raise result
        else:
            if (self.scheduled_query and self.scheduled_query.schedule_failures > 0):
                self.scheduled_query = models.db.session.merge(self.scheduled_query, load=False)
                self.scheduled_query.schedule_failures = 0
                models.db.session.add(self.scheduled_query)
            query_result, updated_query_ids = models.QueryResult.store_result(
                self.data_source.org_id, self.data_source,
                self.query_hash, self.query, data,
                run_time, utcnow())
            models.db.session.commit()  # make sure that alert sees the latest query result
            self._log_progress('checking_alerts')
            for query_id in updated_query_ids:
                check_alerts_for_query.delay(query_id)
            self._log_progress('finished')

            result = query_result.id
            models.db.session.commit()
            return result

    def _annotate_query(self, query_runner):
        self.metadata['Task ID'] = self.task.request.id
        self.metadata['Query Hash'] = self.query_hash
        self.metadata['Queue'] = self.task.request.delivery_info['routing_key']
        self.metadata['Scheduled'] = self.scheduled_query is not None

        return query_runner.annotate_query(self.query, self.metadata)

    def _log_progress(self, state):
        logger.info(
            u"task=execute_query state=%s query_hash=%s type=%s ds_id=%d  "
            "task_id=%s queue=%s query_id=%s username=%s",
            state, self.query_hash, self.data_source.type, self.data_source.id,
            self.task.request.id,
            self.task.request.delivery_info['routing_key'],
            self.metadata.get('Query ID', 'unknown'),
            self.metadata.get('Username', 'unknown'))

    def _load_data_source(self):
        logger.info("task=execute_query state=load_ds ds_id=%d", self.data_source_id)
        return models.DataSource.query.get(self.data_source_id)


# user_id is added last as a keyword argument for backward compatability -- to support executing previously submitted
# jobs before the upgrade to this version.
@celery.task(name="redash.tasks.execute_query", bind=True, track_started=True)
def execute_query(self, query, data_source_id, metadata, user_id=None,
                  scheduled_query_id=None, is_api_key=False):
    if scheduled_query_id is not None:
        scheduled_query = models.Query.query.get(scheduled_query_id)
    else:
        scheduled_query = None

    return QueryExecutor(self, query, data_source_id, user_id, is_api_key, metadata,
                         scheduled_query).run()
