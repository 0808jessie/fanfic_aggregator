"""Thread-local Playwright browser reuse for bounded synchronous scraper workers.

The adapter registry uses a stable pool of worker threads. Playwright's sync API
is not safe to share across arbitrary threads, so this module gives each worker
its own long-lived browser while every scrape still receives a fresh context and
page. Context/page cleanup remains the adapter's responsibility.
"""

from __future__ import annotations

import atexit
import threading
from dataclasses import dataclass
from typing import Any

try:  # pragma: no cover - environment availability is tested by adapters
    from playwright.sync_api import sync_playwright as _native_sync_playwright
except ImportError:  # pragma: no cover
    _native_sync_playwright = None


PLAYWRIGHT_AVAILABLE = _native_sync_playwright is not None
BLOCKED_RESOURCE_TYPES = frozenset({"image", "stylesheet", "font", "media", "websocket"})
_thread_state = threading.local()
_registered_states: list["_BrowserState"] = []
_states_lock = threading.Lock()


@dataclass
class _BrowserState:
    playwright: Any
    browser: Any


class _ChromiumProxy:
    """Expose ``launch`` while returning a browser whose close is lease-safe."""

    def launch(self, **_kwargs: Any) -> "_BrowserProxy":
        return _BrowserProxy(_get_browser_state().browser)


class _BrowserProxy:
    """Delegate context creation while protecting a reusable worker browser."""

    def __init__(self, browser: Any):
        self._browser = browser

    def new_context(self, **kwargs: Any) -> Any:
        return self._browser.new_context(**kwargs)

    def close(self) -> None:
        # Existing adapters call browser.close() in finally. The provider owns
        # the real close at process shutdown, enabling safe worker reuse.
        return None


class _PlaywrightProxy:
    chromium = _ChromiumProxy()


class _SharedPlaywrightSession:
    """Compatibility wrapper for existing ``with sync_playwright()`` adapters."""

    def __enter__(self) -> _PlaywrightProxy:
        if not PLAYWRIGHT_AVAILABLE:
            raise RuntimeError("Playwright is unavailable")
        _get_browser_state()
        return _PlaywrightProxy()

    def __exit__(self, *_exc: Any) -> bool:
        # Do not stop Playwright here: browsers are scoped to a stable worker.
        return False


def sync_playwright() -> _SharedPlaywrightSession:
    """Return a session compatible with Playwright's sync context-manager API."""

    return _SharedPlaywrightSession()


def configure_fast_page(page: Any) -> None:
    """Abort presentation-only requests without changing document/API traffic."""

    def route_handler(route: Any) -> None:
        try:
            if route.request.resource_type in BLOCKED_RESOURCE_TYPES:
                route.abort()
            else:
                route.continue_()
        except Exception:
            # A completed/aborted route is harmless; never turn interception
            # cleanup into an adapter failure.
            return None

    page.route("**/*", route_handler)


def _get_browser_state() -> _BrowserState:
    state = getattr(_thread_state, "browser_state", None)
    if state is not None:
        return state
    if _native_sync_playwright is None:
        raise RuntimeError("Playwright is unavailable")

    playwright = _native_sync_playwright().start()
    browser = playwright.chromium.launch(
        headless=True,
        args=[
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-accelerated-2d-canvas",
            "--disable-gpu",
        ],
    )
    state = _BrowserState(playwright=playwright, browser=browser)
    _thread_state.browser_state = state
    with _states_lock:
        _registered_states.append(state)
    return state


@atexit.register
def close_worker_browsers() -> None:
    """Close all real browser resources only once workers are shutting down."""

    with _states_lock:
        states = list(_registered_states)
        _registered_states.clear()
    for state in states:
        try:
            state.browser.close()
        except Exception:
            pass
        try:
            state.playwright.stop()
        except Exception:
            pass
