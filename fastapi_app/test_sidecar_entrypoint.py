from __future__ import annotations
import os
import sys
from unittest.mock import patch


sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import entrypoint


def test_entrypoint_uses_loopback_host_and_port_8000():
    """The desktop sidecar must only bind to the local loopback interface."""
    assert entrypoint.app is not None
    assert "127.0.0.1" in open(entrypoint.__file__, encoding="utf-8").read()
    assert "port=8000" in open(entrypoint.__file__, encoding="utf-8").read()


def test_onefile_launcher_watchdog_runs_as_daemon_thread():
    """Onefile child must observe launcher termination and exit with the app."""
    with patch.object(entrypoint.threading, "Thread") as thread:
        entrypoint.stop_if_onefile_launcher_exits()

    thread.assert_called_once()
    assert thread.call_args.kwargs["daemon"] is True
    assert thread.call_args.kwargs["name"] == "sidecar-parent-watchdog"
