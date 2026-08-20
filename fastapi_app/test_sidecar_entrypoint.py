import os
import sys
from unittest.mock import patch


sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import entrypoint


def test_entrypoint_uses_loopback_host_and_default_port_8000():
    """The desktop sidecar must use loopback and retain 8000 as its desktop default."""
    assert entrypoint.app is not None
    source = open(entrypoint.__file__, encoding="utf-8").read()
    assert "127.0.0.1" in source
    assert 'os.environ.get("FANFIC_SIDECAR_PORT", "8000")' in source
    assert "port=port" in source


def test_onefile_launcher_watchdog_runs_as_daemon_thread():
    """Onefile child must observe launcher termination and exit with the app."""
    with patch.object(entrypoint.threading, "Thread") as thread:
        entrypoint.stop_if_onefile_launcher_exits()

    thread.assert_called_once()
    assert thread.call_args.kwargs["daemon"] is True
    assert thread.call_args.kwargs["name"] == "sidecar-parent-watchdog"
