"""incremental query results aggregation

Revision ID: 2a2b3b58464e
Revises: 15041b7085fe
Create Date: 2018-02-16 19:28:38.931253

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '2a2b3b58464e'
down_revision = '15041b7085fe'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('query_resultsets',
    sa.Column('query_id', sa.Integer(), nullable=False),
    sa.Column('result_id', sa.Integer(), nullable=False),
    sa.ForeignKeyConstraint(['query_id'], ['queries.id'], ),
    sa.ForeignKeyConstraint(['result_id'], ['query_results.id'], ),
    sa.PrimaryKeyConstraint('query_id', 'result_id')
    )
    op.add_column(u'queries', sa.Column('schedule_keep_results', sa.Integer(), nullable=True))


def downgrade():
    op.drop_column(u'queries', 'schedule_keep_results')
    op.drop_table('query_resultsets')
