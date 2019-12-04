import datetime

from redash import models, redis_connection, settings, utils
from redash.models import ColumnMetadata, TableMetadata
from sqlalchemy.orm import joinedload


def cleanup_data_in_table(table_model):
    TTL_DAYS_AGO = utils.utcnow() - datetime.timedelta(
        days=settings.SCHEMA_METADATA_TTL_DAYS
    )

    table_model.query.filter(
        table_model.exists.is_(False), table_model.updated_at < TTL_DAYS_AGO
    ).delete()

    models.db.session.commit()


def insert_or_update_table_metadata(data_source, existing_tables_set, table_data):
    # Update all persisted tables that exist to reflect this.
    persisted_tables = TableMetadata.query.filter(
        TableMetadata.name.in_(existing_tables_set),
        TableMetadata.data_source_id == data_source.id,
    )
    persisted_table_data = []
    for persisted_table in persisted_tables:
        # Add IDs to persisted table data so it can be used for updates.
        table_data[persisted_table.name]["id"] = persisted_table.id
        persisted_table_data.append(table_data[persisted_table.name])

    models.db.session.bulk_update_mappings(TableMetadata, persisted_table_data)

    # Find the tables that need to be created by subtracting the sets:
    persisted_table_set = set([col_data["name"] for col_data in persisted_table_data])
    tables_to_create = existing_tables_set.difference(persisted_table_set)

    table_metadata = [table_data[table_name] for table_name in tables_to_create]

    models.db.session.bulk_insert_mappings(TableMetadata, table_metadata)


def insert_or_update_column_metadata(table, existing_columns_set, column_data):
    persisted_columns = ColumnMetadata.query.filter(
        ColumnMetadata.name.in_(existing_columns_set),
        ColumnMetadata.table_id == table.id,
    ).all()

    persisted_column_data = []
    for persisted_column in persisted_columns:
        # Add IDs to persisted column data so it can be used for updates.
        column_data[persisted_column.name]["id"] = persisted_column.id
        persisted_column_data.append(column_data[persisted_column.name])

    models.db.session.bulk_update_mappings(ColumnMetadata, persisted_column_data)

    # Find the columns that need to be created by subtracting the sets:
    persisted_column_set = set([col_data["name"] for col_data in persisted_column_data])
    columns_to_create = existing_columns_set.difference(persisted_column_set)

    column_metadata = [column_data[col_name] for col_name in columns_to_create]

    models.db.session.bulk_insert_mappings(ColumnMetadata, column_metadata)


class SchemaCache(object):
    """
    This caches schema requests in redis and uses a method to
    serve stale values while the cache is being populated or
    updated to handle the thundering herd problem.
    """

    timeout = settings.SCHEMAS_REFRESH_SCHEDULE * 60
    # keeping the stale cached items for 10 minutes longer
    # than its timeout to make sure repopulation can work
    stale_cache_timeout = 60 * 10

    def __init__(self, data_source):
        self.data_source = data_source
        self.client = redis_connection
        self.cache_key = "data_source:schema:cache:{}".format(self.data_source.id)
        self.lock_key = "{}:lock".format(self.cache_key)
        self.fresh_key = "{}:fresh".format(self.cache_key)

    def load(self):
        """
        When called will fetch all table and column metadata from
        the database and serialize it with the TableMetadataSerializer.
        """
        # due to the unfortunate import time side effects of
        # Redash's package layout this needs to be done inline
        from redash.serializers import TableMetadataSerializer

        schema = []
        tables = (
            TableMetadata.query.filter(
                TableMetadata.data_source_id == 1, TableMetadata.exists.is_(True),
            )
            .order_by(TableMetadata.name)
            .options(
                joinedload(TableMetadata.existing_columns),
                joinedload(TableMetadata.sample_queries),
            )
        )

        for table in tables:
            schema.append(
                TableMetadataSerializer(table, with_favorite_state=False).serialize()
            )
        return schema

    def get_schema(self, refresh=False):
        """
        Get or set the schema from Redis.

        This will first check for the fresh key and either
        return the schema value if it's still fresh or
        repopulate the cache key and return the stale value.

        This will refresh the schema from the data source's API
        when requested with the refresh parameter, which will also
        (re)populate the cache.
        """
        if refresh:
            from redash.tasks.queries import refresh_schema

            refresh_schema.apply_async(
                args=(self.data_source.id,), queue=settings.SCHEMAS_REFRESH_QUEUE,
            )
        # First check if the fresh key is still there
        is_fresh = redis_connection.get(self.fresh_key)
        # Then try to find out if there is a cached schema
        # already and hasn't timed out yet.
        schema = redis_connection.get(self.cache_key)
        if schema:
            schema = utils.json_loads(schema)
        else:
            schema = []

        if is_fresh:
            # If the cache value is still fresh, just return it.
            return schema
        else:
            # Otherwise pass the stale value to the populate method
            # so it can use it as a fallback in case a population
            # lock is in place already (e.g. another user has already
            # tried to fetch the schema). If the lock can be created
            # successfully, it'll actually load the schema using the
            # load method and set the cache and refresh keys.
            return self.populate(schema)

    def populate(self, schema=None):
        """
        This is the central method to populate the cache and return
        either the provided fallback schema or the value loaded
        from the database.

        It uses Redis locking to make sure the retrieval from the
        database isn't run many times at once.

        It also sets a separate key that indicates freshness that has
        a shorter ttl than the actual cache key that contains the
        schema.

        In the get_schema method it'll check the freshness key first
        and trigger a repopulation of the cache key if it's stale.
        """
        lock = redis_connection.lock(self.lock_key, timeout=self.timeout)
        acquired = lock.acquire(blocking=False)

        if acquired:
            try:
                schema = self.load()
            except Exception:
                raise
            else:
                key_timeout = self.timeout + self.stale_cache_timeout
                pipeline = redis_connection.pipeline()
                pipeline.set(self.cache_key, utils.json_dumps(schema), key_timeout)
                pipeline.set(self.fresh_key, 1, self.timeout)
                pipeline.execute()
            finally:
                lock.release()

        return schema or []
