"""structlog configuration for the whole application."""

import logging
import sys
from typing import Any, MutableMapping, TextIO, cast

import structlog

from app.redaction import redact_value


class _CurrentStderr:
    """Write to whatever ``sys.stderr`` is at write time, not when logging was configured.

    Loggers are cached on first use, so a stream bound at configure time outlives any later
    replacement of ``sys.stderr`` (a test runner's capture, for example) and can be closed.
    """

    def write(self, text: str) -> int:
        return sys.stderr.write(text)

    def flush(self) -> None:
        sys.stderr.flush()


def redact_event(
    _logger: object, _name: str, event_dict: MutableMapping[str, Any]
) -> MutableMapping[str, Any]:
    """Redact every rendered log event, including tracebacks and exception messages.

    A structlog processor rather than a per-call-site rule, so a message built from a Playwright
    log or a provider error cannot leak a configured secret just because that one caller forgot.
    Runs after ``format_exc_info`` so a traceback's text is covered too.
    """
    return cast(MutableMapping[str, Any], redact_value(dict(event_dict)))


def configure_logging(level: str = "INFO") -> None:
    """Configure structlog once at process start.

    Logs go to stderr, never stdout: ``--json`` writes the machine-readable result to stdout
    and CI redirects it to a file (``e2e-healer ... --json > repair-summary.json``), so any
    log line there would make that file invalid JSON.
    """
    logging.basicConfig(format="%(message)s", level=level, stream=sys.stderr)
    structlog.configure(
        logger_factory=structlog.PrintLoggerFactory(file=cast(TextIO, _CurrentStderr())),
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            redact_event,
            structlog.dev.ConsoleRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(logging.getLevelNamesMapping()[level]),
        cache_logger_on_first_use=True,
    )
