import logging
import signal
import time
import datetime

import redis
from celery.exceptions import SoftTimeLimitExceeded, TimeLimitExceeded
from celery.result import AsyncResult
from celery.utils.log import get_task_logger
from six import text_type
from sqlalchemy.orm import load_only

from redash import models, redis_connection, settings, statsd_client, utils
from redash.models import TableMetadata, ColumnMetadata, db
from redash.query_runner import InterruptException
from redash.tasks.alerts import check_alerts_for_query
from redash.utils import gen_query_hash, json_dumps, json_loads, utcnow, mustache_render
from redash.worker import celery

logger = get_task_logger(__name__)


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
            error = "Query exceeded Redash query execution time limit."
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


def enqueue_query(query, data_source, user_id, scheduled_query=None, metadata={}):
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

                time_limit = None

                if scheduled_query:
                    queue_name = data_source.scheduled_queue_name
                    scheduled_query_id = scheduled_query.id
                else:
                    queue_name = data_source.queue_name
                    scheduled_query_id = None
                    time_limit = settings.ADHOC_QUERY_TIME_LIMIT

                args = (query, data_source.id, metadata, user_id, scheduled_query_id)
                argsrepr = json_dumps({
                    'org_id': data_source.org_id,
                    'data_source_id': data_source.id,
                    'enqueue_time': time.time(),
                    'scheduled': scheduled_query_id is not None,
                    'query_id': metadata.get('Query ID'),
                    'user_id': user_id
                })

                result = execute_query.apply_async(args=args,
                                                   argsrepr=argsrepr,
                                                   queue=queue_name,
                                                   time_limit=time_limit)

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
                logging.info("Skipping refresh of %s because the datasource is none.", query.id)
            elif query.data_source.paused:
                logging.info("Skipping refresh of %s because datasource - %s is paused (%s).", query.id, query.data_source.name, query.data_source.pause_reason)
            else:
                if query.options and len(query.options.get('parameters', [])) > 0:
                    query_params = {p['name']: p.get('value')
                                    for p in query.options['parameters']}
                    query_text = mustache_render(query.query_text, query_params)
                else:
                    query_text = query.query_text

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
    new_str = original_str
    if original_str and len(original_str) > max_length:
        new_str = u'{}...'.format(original_str[:max_length])
    return new_str

@celery.task(name="redash.tasks.get_table_sample_data")
def get_table_sample_data(existing_columns, data_source_id, table_name, table_id):
    ds = models.DataSource.get_by_id(data_source_id)
    sample = ds.query_runner.get_table_sample(table_name)
    if not sample:
        return

    persisted_columns = ColumnMetadata.query.filter(
        ColumnMetadata.name.in_(existing_columns),
        ColumnMetadata.table_id == table_id,
    ).options(load_only('id')).all()

     # If a column exists, add a sample to it.
    column_examples = []
    for persisted_column in persisted_columns:
        column_example = sample.get(persisted_column.name, None)
        column_example = column_example if isinstance(column_example, unicode) else (
            str(column_example).decode("utf-8", errors="replace").strip()
        )
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

def cleanup_data_in_table(table_model):
    removed_metadata = table_model.query.filter(
        table_model.exists == False,
    ).options(load_only('updated_at'))

    for removed_metadata_row in removed_metadata:
        is_old_data = (
            utils.utcnow() - removed_metadata_row.updated_at
        ) > datetime.timedelta(days=settings.SCHEMA_METADATA_TTL_DAYS)

        table_model.query.filter(
            table_model.id == removed_metadata_row.id,
        ).delete()

    db.session.commit()

@celery.task(name="redash.tasks.cleanup_schema_metadata")
def cleanup_schema_metadata():
    cleanup_data_in_table(TableMetadata)
    cleanup_data_in_table(ColumnMetadata)

def insert_or_update_table_metadata(ds, existing_tables_set, table_data):
    # Update all persisted tables that exist to reflect this.
    persisted_tables = TableMetadata.query.filter(
        TableMetadata.name.in_(tuple(existing_tables_set)),
        TableMetadata.data_source_id == ds.id,
    )
    persisted_tables.update({"exists": True}, synchronize_session='fetch')


    # Find the tables that need to be created by subtracting the sets:
    # existing_table_set - persisted table_set
    persisted_table_set = set([
        persisted_table.name for persisted_table in persisted_tables.all()
    ])

    tables_to_create = existing_tables_set.difference(persisted_table_set)
    table_metadata = [table_data[table_name] for table_name in list(tables_to_create)]

    models.db.session.bulk_insert_mappings(
        TableMetadata,
        table_metadata
    )

def insert_or_update_column_metadata(table, existing_columns_set, column_data):
    persisted_columns = ColumnMetadata.query.filter(
        ColumnMetadata.name.in_(tuple(existing_columns_set)),
        ColumnMetadata.table_id == table.id,
    ).all()

    persisted_column_data = []
    for persisted_column in persisted_columns:
        # Add id's to persisted column data so it can be used for updates.
        column_data[persisted_column.name]['id'] = persisted_column.id
        persisted_column_data.append(column_data[persisted_column.name])

    models.db.session.bulk_update_mappings(
        ColumnMetadata,
        persisted_column_data
    )
    persisted_column_set = set([col_data['name'] for col_data in persisted_column_data])
    columns_to_create = existing_columns_set.difference(persisted_column_set)

    column_metadata = [column_data[col_name] for col_name in list(columns_to_create)]

    models.db.session.bulk_insert_mappings(
        ColumnMetadata,
        column_metadata
    )

@celery.task(name="redash.tasks.refresh_schema", time_limit=600, soft_time_limit=300)
def refresh_schema(data_source_id):
    ds = models.DataSource.get_by_id(data_source_id)
    logger.info(u"task=refresh_schema state=start ds_id=%s", ds.id)
    start_time = time.time()

    MAX_TYPE_STRING_LENGTH = 250
    try:
        schema = ds.query_runner.get_schema(get_stats=True)

        # Stores data from the updated schema that tells us which
        # columns and which tables currently exist
        existing_tables_set = set()
        existing_columns_set = set()

        # Stores data that will be inserted into postgres
        table_data = {}
        column_data = {}

        new_column_names = {}
        new_column_metadata = {}
        for table in schema:
            table_name = table['name']
            existing_tables_set.add(table_name)

            metadata = 'metadata' in table
            table_data[table_name] = {
                "org_id": ds.org_id,
                "name": table_name,
                "data_source_id": ds.id,
                "column_metadata": "metadata" in table
            }
            new_column_names[table_name] = table['columns']
            new_column_metadata[table_name] = table['metadata']

        insert_or_update_table_metadata(ds, existing_tables_set, table_data)
        models.db.session.flush()

        all_existing_persisted_tables = TableMetadata.query.filter(
            TableMetadata.exists == True,
            TableMetadata.data_source_id == ds.id,
        ).all()

        for j, table in enumerate(all_existing_persisted_tables):
            for i, column in enumerate(new_column_names.get(table.name, [])):
                existing_columns_set.add(column)
                column_data[column] = {
                    'org_id': ds.org_id,
                    'table_id': table.id,
                    'name': column,
                    'type': None,
                    'example': None,
                    'exists': True
                }

                if table.column_metadata:
                    column_type = new_column_metadata[table.name][i]['type']
                    column_type = truncate_long_string(column_type, MAX_TYPE_STRING_LENGTH)
                    column_data[column]['type'] = column_type

            insert_or_update_column_metadata(table, existing_columns_set, column_data)
            models.db.session.commit()

            if ds.query_runner.configuration.get('samples', False):
                get_table_sample_data.apply_async(
                    args=(tuple(existing_columns_set), ds.id, table.name, table.id),
                    queue=settings.SCHEMAS_REFRESH_QUEUE
                )

            # If a column did not exist, set the 'column_exists' flag to false.
            existing_columns_list = tuple(existing_columns_set)
            ColumnMetadata.query.filter(
                ColumnMetadata.exists == True,
                ColumnMetadata.table_id == table.id,
                ~ColumnMetadata.name.in_(existing_columns_list),
            ).update({
                "exists": False,
                "updated_at": db.func.now()
            }, synchronize_session='fetch')

            existing_columns_set = set()


        # If a table did not exist in the get_schema() response above, set the 'exists' flag to false.
        existing_tables_list = tuple(existing_tables_set)
        TableMetadata.query.filter(
            TableMetadata.exists == True,
            TableMetadata.data_source_id == ds.id,
            ~TableMetadata.name.in_(existing_tables_list)
        ).update({
            "exists": False,
            "updated_at": db.func.now()
        }, synchronize_session='fetch')

        models.db.session.commit()

        logger.info(u"task=refresh_schema state=finished ds_id=%s runtime=%.2f", ds.id, time.time() - start_time)
        statsd_client.incr('refresh_schema.success')
    except SoftTimeLimitExceeded:
        logger.info(u"task=refresh_schema state=timeout ds_id=%s runtime=%.2f", ds.id, time.time() - start_time)
        statsd_client.incr('refresh_schema.timeout')
    except Exception:
        logger.warning(u"Failed refreshing schema for the data source: %s", ds.name, exc_info=1)
        statsd_client.incr('refresh_schema.error')
        logger.info(u"task=refresh_schema state=failed ds_id=%s runtime=%.2f", ds.id, time.time() - start_time)


@celery.task(name="redash.tasks.refresh_schemas")
def refresh_schemas():
    """
    Refreshes the data sources schemas.
    """
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

    logger.info(u"task=refresh_schemas state=finish total_runtime=%.2f", time.time() - global_start_time)


def signal_handler(*args):
    raise InterruptException


class QueryExecutionError(Exception):
    pass


# We could have created this as a celery.Task derived class, and act as the task itself. But this might result in weird
# issues as the task class created once per process, so decided to have a plain object instead.
class QueryExecutor(object):
    def __init__(self, task, query, data_source_id, user_id, metadata,
                 scheduled_query):
        self.task = task
        self.query = query
        self.data_source_id = data_source_id
        self.metadata = metadata
        self.data_source = self._load_data_source()
        if user_id is not None:
            self.user = models.User.query.get(user_id)
        else:
            self.user = None
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
            error = text_type(e)
            data = None
            logging.warning('Unexpected error while running query:', exc_info=1)

        run_time = time.time() - started_at

        logger.info(u"task=execute_query query_hash=%s data_length=%s error=[%s]", self.query_hash, data and len(data), error)

        _unlock(self.query_hash, self.data_source.id)

        if error is not None:
            result = QueryExecutionError(error)
            if self.scheduled_query is not None:
                self.scheduled_query = models.db.session.merge(self.scheduled_query, load=False)
                self.scheduled_query.schedule_failures += 1
                models.db.session.add(self.scheduled_query)
            models.db.session.commit()
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
        if query_runner.annotate_query():
            self.metadata['Task ID'] = self.task.request.id
            self.metadata['Query Hash'] = self.query_hash
            self.metadata['Queue'] = self.task.request.delivery_info['routing_key']

            annotation = u", ".join([u"{}: {}".format(k, v) for k, v in self.metadata.iteritems()])
            annotated_query = u"/* {} */ {}".format(annotation, self.query)
        else:
            annotated_query = self.query
        return annotated_query

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
                  scheduled_query_id=None):
    if scheduled_query_id is not None:
        scheduled_query = models.Query.query.get(scheduled_query_id)
    else:
        scheduled_query = None
    return QueryExecutor(self, query, data_source_id, user_id, metadata,
                         scheduled_query).run()
