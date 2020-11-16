from unittest import TestCase
from redash.query_runner.pg import build_schema


class TestBuildSchema(TestCase):
    def test_handles_dups_between_public_and_other_schemas(self):
        results = {
            "rows": [
                {
                    "table_schema": "public",
                    "table_name": "main.users",
                    "column_name": "id",
                    "data_type": "character varying",
                },
                {
                    "table_schema": "main",
                    "table_name": "users",
                    "column_name": "id",
                    "data_type": "character varying",
                },
                {
                    "table_schema": "main",
                    "table_name": "users",
                    "column_name": "name",
                    "data_type": "character varying",
                },
            ]
        }

        schema = {}

        build_schema(results, schema)

        self.assertIn("main.users", schema.keys())
        self.assertListEqual([column["name"] for column in schema["main.users"]["columns"]], ["id", "name"])
        self.assertIn('public."main.users"', schema.keys())
        self.assertListEqual([column["name"] for column in schema['public."main.users"']["columns"]], ["id"])
