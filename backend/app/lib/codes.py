"""Invite-code generator.

6 characters from a confusion-resistant alphabet (no I, O, 0, 1).
32^6 ≈ 1 billion — collisions on live codes are astronomically rare.
"""

from __future__ import annotations

import secrets

ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
CODE_LENGTH = 6


def generate() -> str:
    return "".join(secrets.choice(ALPHABET) for _ in range(CODE_LENGTH))
