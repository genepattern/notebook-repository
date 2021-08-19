"""Adding citation

Revision ID: 34f12461157c
Revises: 639b48c16ede
Create Date: 2021-08-19 10:16:56.821694

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '34f12461157c'
down_revision = '639b48c16ede'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('projects', sa.Column('citation', sa.String(511)))


def downgrade():
    op.drop_column('projects', 'citation')
