import json
import mock
from tests import BaseTestCase

from redash import redis_connection
from redash.tasks.health import update_health_status, health_status


class TestHealthStatus(BaseTestCase):
    def setUp(self):
        super(TestHealthStatus, self).setUp()
        self.patched_custom_queries = self._setup_mock('redash.tasks.health.settings')
        self.patched_updated_health_status = self._setup_mock('redash.tasks.health.update_health_status')
        self.patched_run_query = self._setup_mock('redash.query_runner.pg.PostgreSQL.run_query')

        self.patched_run_query.return_value = ("some_data", None)
        self.patched_custom_queries.CUSTOM_HEALTH_QUERIES = ""

    def _setup_mock(self, function_to_patch):
        patcher = mock.patch(function_to_patch)
        patched_function = patcher.start()
        self.addCleanup(patcher.stop)
        return patched_function

    def test_update_health_status_sets_correct_keys(self):
        current_health = redis_connection.get('data_sources:health')
        self.assertEqual(None, current_health)

        DATA_SOURCE = self.factory.create_data_source()
        QUERY_SUCCESS = "SELECT 1"
        QUERY_FAIL = "SELECT meep"
        SOME_DATA_FAIL = {"a": "b", "foo": "bar", "status": "FAIL"}
        SOME_DATA_SUCCESS = {"a": "b", "foo": "bar", "status": "SUCCESS"}
        update_health_status(str(DATA_SOURCE.id), DATA_SOURCE.name, QUERY_FAIL, SOME_DATA_FAIL)
        update_health_status(str(DATA_SOURCE.id), DATA_SOURCE.name, QUERY_SUCCESS, SOME_DATA_SUCCESS)

        '''
          The expected format of the cached health data is:
          {
            "<data_source_id>": {
              "metadata": "<data_source_name>",
              "queries": {
                "<query_text>": {...},
                "<query_text>": {...},
                "<query_text>": {...},
                ...
              }
            },
            ...
          }
        '''
        current_health = json.loads(redis_connection.get('data_sources:health'))

        # There is 1 data source.
        self.assertEqual(1, len(current_health.keys()))
        self.assertEqual(DATA_SOURCE.id, int(current_health.keys()[0]))

        # The data source has "metadata", "queries" and "status" keys.
        ds_id = str(DATA_SOURCE.id)
        self.assertEqual(3, len(current_health[ds_id].keys()))
        self.assertTrue("metadata" in current_health[ds_id].keys())
        self.assertTrue("queries" in current_health[ds_id].keys())
        self.assertTrue("status" in current_health[ds_id].keys())

        # There are two queries with correct data
        self.assertEqual(2, len(current_health[ds_id]["queries"]))
        self.assertTrue(QUERY_SUCCESS in current_health[ds_id]["queries"].keys())
        self.assertTrue(QUERY_FAIL in current_health[ds_id]["queries"].keys())
        self.assertEqual(SOME_DATA_FAIL, current_health[ds_id]["queries"][QUERY_FAIL])
        self.assertEqual(SOME_DATA_SUCCESS, current_health[ds_id]["queries"][QUERY_SUCCESS])
        self.assertEqual(SOME_DATA_FAIL["status"], current_health[ds_id]["status"])

    def test_health_status_success(self):
        data_sources = []
        for i in range(5):
            data_sources.append(self.factory.create_data_source())

        health_status()

        # Status is updated for each of the 5 data sources
        self.assertEqual(self.patched_updated_health_status.call_count, 5)

        # The data source name and id is correctly passed in the last call of update_health_status()
        args, kwargs = self.patched_updated_health_status.call_args
        self.assertEqual(str(data_sources[-1].id), args[0])
        self.assertEqual(data_sources[-1].name, args[1])

        # All expected status keys are available.
        EXPECTED_KEYS = ["status", "last_run", "last_run_human", "runtime"]
        NEW_STATUS = args[3]
        new_status_keys = set(NEW_STATUS.keys())
        self.assertEqual(set(EXPECTED_KEYS), new_status_keys)

        self.assertEqual("SUCCESS", NEW_STATUS["status"])
        for key in EXPECTED_KEYS[1:]:
            self.assertIsNotNone(NEW_STATUS[key])

    def test_health_status_run_query_throws_exception(self):
        data_source = self.factory.create_data_source()

        def exception_raiser(*args, **kwargs):
          raise Exception

        self.patched_run_query.side_effect = exception_raiser
        health_status()

        # Status is updated for the one data source
        self.assertEqual(self.patched_updated_health_status.call_count, 1)

        # The data source name is correctly passed in the last call of update_health_status()
        args, kwargs = self.patched_updated_health_status.call_args
        self.assertEqual(str(data_source.id), args[0])
        self.assertEqual(data_source.name, args[1])
        self.assertEqual(data_source.query_runner.noop_query, args[2])

        # All expected status keys are available.
        EXPECTED_KEYS = ['status', 'last_run', 'last_run_human', 'runtime']
        NEW_STATUS = args[3]
        new_status_keys = set(NEW_STATUS.keys())
        self.assertEqual(set(EXPECTED_KEYS), new_status_keys)

        self.assertEqual('FAIL', NEW_STATUS['status'])
        self.assertIsNotNone(NEW_STATUS['last_run'])
        self.assertIsNotNone(NEW_STATUS['last_run_human'])
        self.assertIsNone(NEW_STATUS['runtime'])

    def test_health_status_custom_query(self):
        CUSTOM_QUERY = "select * from table"
        data_source = self.factory.create_data_source()
        self.patched_custom_queries.CUSTOM_HEALTH_QUERIES = {"1": CUSTOM_QUERY}

        health_status()

        args, kwargs = self.patched_updated_health_status.call_args
        self.assertNotEqual(data_source.query_runner.noop_query, args[2])
        self.assertEqual(CUSTOM_QUERY, args[2])
