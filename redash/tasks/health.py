import json
import time
from random import randint

from celery.utils.log import get_task_logger
from redash import models, redis_connection, settings, statsd_client
from redash.worker import celery
from redash.utils import parse_human_time

logger = get_task_logger(__name__)


def update_health_status(data_source_id, data_source_name, query_text, data):
    key = "data_sources:health"

    cache = json.loads(redis_connection.get(key) or '{}')
    if data_source_id not in cache:
        cache[data_source_id] = {
            "metadata": { "name": data_source_name },
            "queries": {}
        }
    cache[data_source_id]["queries"][query_text] = data

    cache[data_source_id]["status"] = "SUCCESS"
    for query_status in cache[data_source_id]["queries"].values():
        if query_status["status"] == "FAIL":
            cache[data_source_id]["status"] = "FAIL"
            break

    redis_connection.set(key, json.dumps(cache))

@celery.task(name="redash.tasks.health_status", time_limit=90, soft_time_limit=60)
def health_status():
    for ds in models.DataSource.query:
        logger.info(u"task=health_status state=start ds_id=%s", ds.id)

        runtime = None
        query_text = ds.query_runner.noop_query
        custom_queries = settings.CUSTOM_HEALTH_QUERIES
        ds_id = str(ds.id)

        if custom_queries and ds_id in custom_queries:
            query_text = custom_queries[ds_id]

        try:
            start_time = time.time()
            ds.query_runner.test_connection(query_text)
            runtime = time.time() - start_time
        except Exception as e:
            logger.warning(u"Failed health check for the data source: %s", ds.name, exc_info=1)
            statsd_client.incr('health_status.error')
            logger.info(u"task=health_status state=error ds_id=%s runtime=%.2f", ds.id, time.time() - start_time)

        update_health_status(ds_id, ds.name, query_text, {
            "status": "SUCCESS" if runtime is not None else "FAIL",
            "last_run": start_time,
            "last_run_human": str(parse_human_time(str(start_time))),
            "runtime": runtime
        })
