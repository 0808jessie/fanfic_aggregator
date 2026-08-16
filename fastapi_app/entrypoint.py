from __future__ import annotations
import sys
import os
import threading
import time
import uvicorn

current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

from main import app


def stop_if_onefile_launcher_exits() -> None:
    """End the extracted PyInstaller child when its launcher process is gone.

    PyInstaller's onefile bootloader starts this Python runtime as a child process.
    Tauri terminates that launcher on app exit; without this watchdog the extracted
    FastAPI process can remain orphaned and keep port 8000 open.
    """
    launcher_pid = os.getppid()

    def watch_parent() -> None:
        while True:
            time.sleep(0.5)
            if os.getppid() != launcher_pid:
                os._exit(0)

    threading.Thread(target=watch_parent, name="sidecar-parent-watchdog", daemon=True).start()


if __name__ == "__main__":
    stop_if_onefile_launcher_exits()
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="info")
