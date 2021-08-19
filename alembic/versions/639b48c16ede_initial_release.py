"""Initial release

Revision ID: 639b48c16ede
Revises: 
Create Date: 2021-08-18 15:41:23.784485

"""
from alembic import op
import sqlalchemy as sa
from datetime import datetime

# To mark the existing database as up to this point
# alembic stamp 639b48c16ede


# revision identifiers, used by Alembic.
revision = '639b48c16ede'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'projects',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('dir', sa.String(255)),
        sa.Column('image', sa.String(255)),
        sa.Column('name', sa.String(255)),
        sa.Column('description', sa.String(255), default=''),
        sa.Column('author', sa.String(255), default=''),
        sa.Column('quality', sa.String(255), default=''),
        sa.Column('created', sa.DateTime, default=datetime.utcnow),
        sa.Column('updated', sa.DateTime, default=datetime.utcnow),
        sa.Column('copied', sa.Integer, default=1),
        sa.Column('owner', sa.String(255)),
        sa.Column('deleted', sa.Boolean, default=False),
    )

    op.create_table(
        'tags',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('label', sa.String(63)),
        sa.Column('description', sa.String(255), default=''),
        sa.Column('protected', sa.Boolean, default=False),
        sa.Column('pinned', sa.Boolean, default=False),
    )

    op.create_table(
        'project_tags',
        sa.Column('projects_id', sa.Integer, sa.ForeignKey('projects.id')),
        sa.Column('tags_id', sa.Integer, sa.ForeignKey('tags.id')),
    )

    op.create_table(
        'updates',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('project_id', sa.Integer, sa.ForeignKey('projects.id')),
        sa.Column('updated', sa.DateTime, default=datetime.utcnow),
        sa.Column('comment', sa.String(255), default=''),
    )

    op.create_table(
        'shares',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('owner', sa.String(255)),
        sa.Column('dir', sa.String(255)),
    )

    op.create_table(
        'invites',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('share_id', sa.Integer, sa.ForeignKey('shares.id')),
        sa.Column('user', sa.String(255)),
        sa.Column('accepted', sa.Boolean, default=False),
    )


def downgrade():
    pass
