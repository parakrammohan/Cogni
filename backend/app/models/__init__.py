"""SQLAlchemy ORM models. Importing this package registers every model
class against `app.db.Base.metadata`, which Alembic introspects."""

from app.models.contact import Contact  # noqa: F401
from app.models.memory import Memory  # noqa: F401
from app.models.pairing import InviteCode, Pairing  # noqa: F401
from app.models.profile import Profile  # noqa: F401
from app.models.reminder import Reminder  # noqa: F401
from app.models.session import Session  # noqa: F401
from app.models.user import User  # noqa: F401

__all__ = [
    "Contact",
    "InviteCode",
    "Memory",
    "Pairing",
    "Profile",
    "Reminder",
    "Session",
    "User",
]
