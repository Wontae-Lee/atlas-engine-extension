#!/usr/bin/env python3
import argparse
import os
from pathlib import Path
import shutil
import subprocess
import sys


def main():
    # Debugging can attach after startup or pause the Extension Host before its code runs.
    parser = argparse.ArgumentParser(
        description="Build the extension, launch an isolated VS Code development window, and watch.",
        epilog="Environment: VSCODE_BIN (default: code), DEBUG_PORT (default: 9230). "
        "Close the development window separately; Ctrl+C stops the watcher.",
    )
    parser.add_argument("--debug", dest="debug_mode", action="store_const",
                        const="inspect-extensions", help="Enable Extension Host inspector.")
    parser.add_argument("--debug-break", dest="debug_mode", action="store_const",
                        const="inspect-brk-extensions", help="Wait for a debugger before running Extension Host code.")
    parser.add_argument("--no-watch", action="store_true", help="Build and launch without starting the watcher.")
    args = parser.parse_args()

    # Resolve paths from this file so IDE working-directory settings do not affect execution.
    project_root = Path(__file__).resolve().parent.parent
    os.chdir(project_root)

    # Environment overrides allow a custom VS Code installation and debugger port.
    vscode_bin = os.environ.get("VSCODE_BIN") or "code"
    debug_port = os.environ.get("DEBUG_PORT") or "9230"

    # Check prerequisites before installing dependencies or building the extension.
    for executable in ("node", "npm", vscode_bin):
        if shutil.which(executable) is None:
            print(f"Required executable not found: {executable}\nSee docs/development.md", file=sys.stderr)
            return 1

    # The inspector needs a valid TCP port only when debugging is enabled.
    if args.debug_mode:
        if not (debug_port.isascii() and debug_port.isdigit()
                and 1 <= len(debug_port) <= 5 and 1 <= int(debug_port) <= 65535):
            parser.error("DEBUG_PORT must be an integer between 1 and 65535.")

    # Install from the lockfile on first use; subsequent dependency updates require npm ci.
    if not (project_root / "node_modules").is_dir():
        subprocess.run(["npm", "ci"], check=True)
    subprocess.run([sys.executable, "scripts/generate_manifest.py"], check=True)
    # Stop on build failure so the development window does not load an outdated bundle.
    subprocess.run(["npm", "run", "compile"], check=True)

    # Keep development settings, installed extensions, and workspace separate from daily use.
    dev_root = project_root / ".vscode-dev"
    for directory in ("user-data", "extensions", "workspace"):
        (dev_root / directory).mkdir(parents=True, exist_ok=True)

    # Load this repository as an extension inside a dedicated VS Code development window.
    launch_args = [
        vscode_bin,
        "--new-window",
        f"--extensionDevelopmentPath={project_root}",
        f"--user-data-dir={dev_root / 'user-data'}",
        f"--extensions-dir={dev_root / 'extensions'}",
        str(dev_root / "workspace"),
    ]
    if args.debug_mode:
        launch_args.append(f"--{args.debug_mode}={debug_port}")
        print(f"CLion: Attach to Node.js/Chrome at localhost:{debug_port}", flush=True)

    subprocess.run(launch_args, check=True)
    print("\nIn the development window: run Atlas Engine: Show Layout from the Command Palette.")
    print("After edits: save, wait for build completion, then Developer: Reload Window.")
    if not args.no_watch:
        print("Ctrl+C stops the watcher. Close the development window separately.\n", flush=True)
        # Replace Python with npm so terminal interrupts reach the watcher directly.
        os.execvp("npm", ["npm", "run", "watch"])
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except subprocess.CalledProcessError as error:
        # Preserve command failures and translate signal termination into a shell exit code.
        sys.exit(error.returncode if error.returncode > 0 else 128 - error.returncode)
    except KeyboardInterrupt:
        # Use the conventional Ctrl+C exit code without printing a Python traceback.
        sys.exit(130)
