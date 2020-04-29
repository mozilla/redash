"""Remove query_resultsets and queries.schedule_resultset_size

Revision ID: da6767746e76
Revises: 171aaafb2d52
Create Date: 2020-04-29 21:12:19.762731

"""
from alembic import op
from sqlalchemy.engine.reflection import Inspector

# revision identifiers, used by Alembic.
revision = "da6767746e76"
down_revision = "171aaafb2d52"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    inspector = Inspector.from_engine(conn)

    tables = inspector.get_table_names()
    print(f"Tables found: {tables}")
    table_to_delete = "query_resultsets"
    if table_to_delete in tables:
        op.drop_table(table_to_delete)

    queries_table = "queries"
    column_to_delete = "schedule_resultset_size"
    column_names = [column["name"] for column in inspector.get_columns(queries_table)]
    print(f"Columns found in '{queries_table}' table: {column_names}")
    if column_to_delete in column_names:
        op.drop_column(queries_table, column_to_delete)


def downgrade():
    pass
