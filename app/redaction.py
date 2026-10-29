"""Shared redaction for model evidence, structured logs and repair reports.

The same primitives are the boundary for evidence that leaves the machine: every prompt is
built from values that passed through :func:`redact_value` or :func:`redact_text`, and the
structured-log pipeline runs each event through :func:`redact_value` before rendering. Along
with the built-in credential patterns, callers can name secrets they want replaced via
``E2E_HEALER_SENSITIVE_ENV_VARS`` (variable names, read at call time) and
``E2E_HEALER_SENSITIVE_VALUES`` (literals).
"""

import os
import re
from dataclasses import dataclass, field
from typing import Callable, Match
from urllib.parse import parse_qsl, unquote, urlencode, urlsplit, urlunsplit

from app.config import settings

REDACTED = "[REDACTED]"
# Short configured values cannot be told apart from ordinary words in a log or a DOM diff, so
# they are rejected at load time rather than silently redacting chunks of every prompt.
MIN_CONFIGURED_SECRET_LENGTH = 4


@dataclass
class RedactionRecord:
    """Count replacements so a caller can report whether evidence was actually redacted."""

    count: int = field(default=0)

    @property
    def applied(self) -> bool:
        """Whether at least one value was replaced."""
        return self.count > 0

    def note(self, replacements: int = 1) -> None:
        """Record ``replacements`` substituted values."""
        self.count += replacements


SENSITIVE_KEYS = frozenset(
    {
        "token",
        "access_token",
        "refresh_token",
        "api_key",
        "apikey",
        "authorization",
        "password",
        "secret",
        "session",
        "cookie",
        "credential",
    }
)
_URL_RE = re.compile(r"https?://[^\s'\"<>]+")
_AUTHORIZATION_RE = re.compile(r"(?i)\b(authorization\s*:\s*(?:bearer|basic|token)\s+)[^\s,;]+")
_CREDENTIAL_PAIR_RE = re.compile(
    r"(?i)\b(token|access_token|refresh_token|api_key|apikey|password|secret|credential)"
    r"\s*=\s*([^\s&,;]+)"
)


def configured_secrets() -> list[str]:
    """Return the user-configured secret values, longest first.

    Environment variables are read on every call and never copied into settings, so a secret
    only ever lives where the user put it. Values shorter than
    :data:`MIN_CONFIGURED_SECRET_LENGTH` and values that are already :data:`REDACTED` are
    dropped: they would corrupt ordinary text without hiding anything. Commas separate
    values, so a secret containing a comma cannot be configured this way.
    """
    candidates: list[str] = []
    for name in settings.sensitive_env_vars.split(","):
        variable = name.strip()
        if variable:
            candidates.append(os.environ.get(variable, ""))
    candidates.extend(settings.sensitive_values.get_secret_value().split(","))
    usable = {
        value.strip()
        for value in candidates
        if len(value.strip()) >= MIN_CONFIGURED_SECRET_LENGTH and value.strip() != REDACTED
    }
    # Longest first so a secret that embeds another configured secret is replaced whole.
    return sorted(usable, key=len, reverse=True)


def _sub_counting(
    pattern: re.Pattern[str],
    replace: Callable[[Match[str]], str],
    text: str,
    record: RedactionRecord | None,
) -> str:
    """Apply ``pattern`` and count each substitution on ``record``."""

    def counted(match: Match[str]) -> str:
        replacement = replace(match)
        # A pattern can match text it decides to keep (a URL with nothing sensitive in it), and
        # reporting that as a redaction would overstate what the boundary did.
        if record is not None and replacement != match.group(0):
            record.note()
        return replacement

    return pattern.sub(counted, text)


def _redact_credential_pair(match: Match[str]) -> str:
    """Replace a credential pair's value, unless it is already the redaction marker.

    URL redaction runs first, so ``token=[REDACTED]`` (or its percent-encoded form) may already
    be in place; replacing that a second time would inflate the reported count without hiding
    anything further.
    """
    if unquote(match.group(2)) == REDACTED:
        return match.group(0)
    return f"{match.group(1)}={REDACTED}"


def redact_text(text: str, *, record: RedactionRecord | None = None) -> str:
    """Redact credential patterns and configured secrets from free text.

    Covers bare strings (a Playwright log, an ARIA snapshot) as well as the string leaves of a
    structure. ``record`` accumulates how many values were replaced, so a caller can report
    that redaction happened without diffing the result.
    """
    safe = text
    for secret in configured_secrets():
        if secret in safe:
            if record is not None:
                record.note(safe.count(secret))
            safe = safe.replace(secret, REDACTED)
    safe = _sub_counting(_URL_RE, lambda match: redact_url(match.group(0)), safe, record)
    safe = _sub_counting(
        _AUTHORIZATION_RE, lambda match: f"{match.group(1)}{REDACTED}", safe, record
    )
    return _sub_counting(_CREDENTIAL_PAIR_RE, _redact_credential_pair, safe, record)


def redact_value(value: object, *, record: RedactionRecord | None = None) -> object:
    """Recursively redact structured values before they are persisted, logged, or emitted."""
    if isinstance(value, dict):
        return {
            str(key): (
                REDACTED
                if str(key).casefold() in SENSITIVE_KEYS
                else redact_value(item, record=record)
            )
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [redact_value(item, record=record) for item in value]
    if isinstance(value, str):
        return redact_text(value, record=record)
    return value


def redact_url(url: str) -> str:
    """Return a URL safe to persist or log, preserving non-sensitive query values."""
    parts = urlsplit(url)
    query = [
        (key, REDACTED if key.casefold() in SENSITIVE_KEYS else value)
        for key, value in parse_qsl(parts.query, keep_blank_values=True)
    ]
    netloc = parts.netloc.rsplit("@", 1)[-1]
    fragment = REDACTED if parts.fragment else ""
    return urlunsplit((parts.scheme, netloc, parts.path, urlencode(query), fragment))
