"""SQLAlchemy ORM models. Importing this package registers every model
class against `app.db.Base.metadata`, which Alembic introspects."""

from app.models.session import Session  # noqa: F401
from app.models.user import User  # noqa: F401

__all__ = ["Session", "User"]
