"""create game_sessions, pursuit_results, alerts, geofence_zones,
geofence_settings, screening_results

Revision ID: 0005
Revises: 0004
Create Date: 2026-05-18
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "game_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "patient_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("game", sa.String(length=60), nullable=False),
        sa.Column("memory_span", sa.Integer(), server_default="0", nullable=False),
        sa.Column("avg_reaction", sa.Integer(), server_default="0", nullable=False),
        sa.Column("mistakes", sa.Integer(), server_default="0", nullable=False),
        sa.Column("score", sa.Float(), server_default="0", nullable=False),
        sa.Column(
            "status",
            sa.Enum("checkpoint", "final", name="game_status"),
            server_default="final",
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_game_sessions_patient_id", "game_sessions", ["patient_id"])
    op.create_index("ix_game_sessions_created_at", "game_sessions", ["created_at"])

    op.create_table(
        "pursuit_results",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "patient_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("gain", sa.Float(), nullable=False),
        sa.Column("accuracy", sa.Float(), nullable=False),
        sa.Column("saccade_rate", sa.Float(), nullable=False),
        sa.Column("latency_ms", sa.Float(), nullable=False),
        sa.Column(
            "risk", sa.Enum("low", "moderate", "high", name="pursuit_risk"), nullable=False
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_pursuit_results_patient_id", "pursuit_results", ["patient_id"])
    op.create_index("ix_pursuit_results_created_at", "pursuit_results", ["created_at"])

    op.create_table(
        "alerts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "patient_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("module", sa.String(length=60), nullable=False),
        sa.Column(
            "severity",
            sa.Enum("info", "warning", "danger", "good", "calm", name="alert_severity"),
            nullable=False,
        ),
        sa.Column("title", sa.String(length=240), nullable=False),
        sa.Column("message", sa.Text(), server_default="", nullable=False),
        sa.Column("dedupe_key", sa.String(length=120), nullable=True),
        sa.Column("dismissed", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_alerts_patient_id", "alerts", ["patient_id"])
    op.create_index("ix_alerts_created_at", "alerts", ["created_at"])

    op.create_table(
        "geofence_zones",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "patient_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("polygon_geojson", postgresql.JSONB, nullable=False),
        sa.Column(
            "alert_modes",
            postgresql.ARRAY(sa.String(length=20)),
            server_default="{}",
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_geofence_zones_patient_id", "geofence_zones", ["patient_id"])

    op.create_table(
        "geofence_settings",
        sa.Column(
            "patient_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "wandering_enabled",
            sa.Boolean(),
            server_default=sa.text("true"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    op.create_table(
        "screening_results",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "patient_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "model",
            sa.Enum(
                "alzheimer_tabular",
                "dementia_oasis",
                "adresso_agitation",
                "alzheimer_mri",
                name="screening_model",
            ),
            nullable=False,
        ),
        sa.Column("inputs_json", postgresql.JSONB, nullable=False),
        sa.Column("probability", sa.Float(), nullable=False),
        sa.Column(
            "band",
            sa.Enum("low", "moderate", "high", name="screening_band"),
            nullable=False,
        ),
        sa.Column("classes_json", postgresql.JSONB, nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_screening_results_patient_id", "screening_results", ["patient_id"])
    op.create_index("ix_screening_results_model", "screening_results", ["model"])
    op.create_index("ix_screening_results_created_at", "screening_results", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_screening_results_created_at", table_name="screening_results")
    op.drop_index("ix_screening_results_model", table_name="screening_results")
    op.drop_index("ix_screening_results_patient_id", table_name="screening_results")
    op.drop_table("screening_results")
    sa.Enum(name="screening_band").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="screening_model").drop(op.get_bind(), checkfirst=True)

    op.drop_table("geofence_settings")

    op.drop_index("ix_geofence_zones_patient_id", table_name="geofence_zones")
    op.drop_table("geofence_zones")

    op.drop_index("ix_alerts_created_at", table_name="alerts")
    op.drop_index("ix_alerts_patient_id", table_name="alerts")
    op.drop_table("alerts")
    sa.Enum(name="alert_severity").drop(op.get_bind(), checkfirst=True)

    op.drop_index("ix_pursuit_results_created_at", table_name="pursuit_results")
    op.drop_index("ix_pursuit_results_patient_id", table_name="pursuit_results")
    op.drop_table("pursuit_results")
    sa.Enum(name="pursuit_risk").drop(op.get_bind(), checkfirst=True)

    op.drop_index("ix_game_sessions_created_at", table_name="game_sessions")
    op.drop_index("ix_game_sessions_patient_id", table_name="game_sessions")
    op.drop_table("game_sessions")
    sa.Enum(name="game_status").drop(op.get_bind(), checkfirst=True)
