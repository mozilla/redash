import logging
import re

import requests

from redash.query_runner import *
from redash.utils import json_dumps, json_loads

logger = logging.getLogger(__name__)


class ClickHouse(BaseSQLQueryRunner):
    noop_query = "SELECT 1"

    @classmethod
    def configuration_schema(cls):
        return {
            "type": "object",
            "properties": {
                "url": {
                    "type": "string",
                    "default": "http://127.0.0.1:8123"
                },
                "user": {
                    "type": "string",
                    "default": "default"
                },
                "password": {
                    "type": "string"
                },
                "dbname": {
                    "type": "string",
                    "title": "Database Name"
                },
                "timeout": {
                    "type": "number",
                    "title": "Request Timeout",
                    "default": 30
                },
                "toggle_table_string": {
                    "type": "string",
                    "title": "Toggle Table String",
                    "default": "_v",
                    "info": "This string will be used to toggle visibility of tables in the schema browser when editing a query in order to remove non-useful tables from sight."
                }
            },
            "required": ["dbname"],
            "secret": ["password"]
        }

    @classmethod
    def type(cls):
        return "clickhouse"

    def _get_tables(self, schema):
        query = "SELECT database, table, name FROM system.columns WHERE database NOT IN ('system')"

        results, error = self.run_query(query, None)

        if error is not None:
            raise Exception("Failed getting schema.")

        results = json_loads(results)

        for row in results['rows']:
            table_name = '{}.{}'.format(row['database'], row['table'])

            if table_name not in schema:
                schema[table_name] = {'name': table_name, 'columns': []}

            schema[table_name]['columns'].append(row['name'])

        return schema.values()

    def _send_query(self, data, stream=False):
        r = requests.post(
            self.configuration['url'],
            data=data.encode("utf-8"),
            stream=stream,
            timeout=self.configuration.get('timeout', 30),
            params={
                'user': self.configuration['user'],
                'password':  self.configuration['password'],
                'database': self.configuration['dbname']
            }
        )
        if r.status_code != 200:
            raise Exception(r.text)
        # logging.warning(r.json())
        return r.json()

    @staticmethod
    def _define_column_type(column):
        c = column.lower()
        f = re.search(r'^nullable\((.*)\)$', c)
        if f is not None:
            c = f.group(1)
        if c.startswith('int') or c.startswith('uint'):
            return TYPE_INTEGER
        elif c.startswith('float'):
            return TYPE_FLOAT
        elif c == 'datetime':
            return TYPE_DATETIME
        elif c == 'date':
            return TYPE_DATE
        else:
            return TYPE_STRING

    def _clickhouse_query(self, query):
        query += '\nFORMAT JSON'
        result = self._send_query(query)
        columns = []
        columns_int64 = []  # db converts value to string if its type equals UInt64
        columns_totals = {}

        for r in result['meta']:
            column_name = r['name']
            column_type = self._define_column_type(r['type'])

            if 'Int64' in r['type']:
                columns_int64.append(column_name)
            else:
                columns_totals[column_name] = 'Total' if column_type == TYPE_STRING else None

            columns.append({'name': column_name, 'friendly_name': column_name, 'type': column_type})

        rows = result['data']
        for row in rows:
            for column in columns_int64:
                row[column] = int(row[column])

        if 'totals' in result:
            totals = result['totals']
            for column, value in columns_totals.iteritems():
                totals[column] = value
            rows.append(totals)

        return {'columns': columns, 'rows': rows}

    def run_query(self, query, user):
        logger.debug("Clickhouse is about to execute query: %s", query)
        if query == "":
            json_data = None
            error = "Query is empty"
            return json_data, error
        try:
            q = self._clickhouse_query(query)
            data = json_dumps(q)
            error = None
        except Exception as e:
            data = None
            logging.exception(e)
            error = unicode(e)
        return data, error

register(ClickHouse)
