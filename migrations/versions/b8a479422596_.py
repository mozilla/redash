"""
Migrate schedule_until to schedule.until

Revision ID: b8a479422596
Revises: 151a4c333e96
Create Date: 2018-10-10 14:53:20.042470

"""
from datetime import datetime
from alembic import op
import sqlalchemy as sa
from sqlalchemy.sql import table

from redash.models import MutableDict, PseudoJSON


# revision identifiers, used by Alembic.
revision = 'b8a479422596'
down_revision = '151a4c333e96'
branch_labels = None
depends_on = None


def upgrade():
  queries = table(
    'queries',
    sa.Column('id', sa.Integer, primary_key=True),
    sa.Column('schedule', MutableDict.as_mutable(PseudoJSON)),
    sa.Column('schedule_until', sa.DateTime(True), nullable=True))

  conn = op.get_bind()
  for query in conn.execute(queries.select()):
    if query.schedule_until is None:
      continue

    schedule_json = query.schedule
    if schedule_json is None:
      schedule_json = {
        'interval': None,
        'day_of_week': None,
        'time': None
      }
    schedule_json['until'] = query.schedule_until.strftime('%Y-%m-%d')

    conn.execute(
      queries
        .update()
        .where(queries.c.id == query.id)
        .values(schedule=MutableDict(schedule_json)))

  op.drop_column('queries', 'schedule_until')


def downgrade():
  op.add_column('queries', sa.Column('schedule_until', sa.DateTime(True), nullable=True))

  queries = table(
    'queries',
    sa.Column('id', sa.Integer, primary_key=True),
    sa.Column('schedule', MutableDict.as_mutable(PseudoJSON)),
    sa.Column('schedule_until', sa.DateTime(True), nullable=True))

  conn = op.get_bind()
  for query in conn.execute(queries.select()):
    if query.schedule is None or query.schedule['until'] is None:
      continue

    scheduleUntil = datetime.strptime(query.schedule['until'], '%Y-%m-%d')

    conn.execute(
      queries
          .update()
          .where(queries.c.id == query.id)
          .values(schedule_until=scheduleUntil))
