#!/usr/bin/env bash
# Some IDE shell configurations invoke this file with sh, ignoring the shebang.
# Keep this bootstrap POSIX-compatible until Bash takes over.
if [ -z "${BASH_VERSION:-}" ]; then
  if ! command -v bash >/dev/null 2>&1; then
    printf 'Bash is required to run scripts/dev.sh. Please install Bash.\n' >&2
    exit 1
  fi
  exec bash "$0" "$@"
fi

set -euo pipefail

usage() {
  cat <<'EOF'
Usage: npm run dev -- [--debug | --debug-break] [--no-watch]

Build the extension, launch an isolated VS Code development window, and watch.
  --debug        Enable Extension Host inspector (default port: 9230).
  --debug-break  Wait for a debugger before running Extension Host code.
  --no-watch     Build and launch once, without starting the build watcher.
  --help        Show this help.

Environment:
  VSCODE_BIN    VS Code CLI executable name or path (default: code).
  DEBUG_PORT    Inspector port (default: 9230).

Close the development window separately; Ctrl+C stops the watcher.
EOF
}

debug_mode=''
watch=true
for arg in "$@"; do
  case "$arg" in
    --debug) debug_mode=inspect-extensions ;;
    --debug-break) debug_mode=inspect-brk-extensions ;;
    --no-watch) watch=false ;;
    --help|-h) usage; exit 0 ;;
    *) printf 'Unknown argument: %s\n' "$arg" >&2; usage >&2; exit 2 ;;
  esac
done

project_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"
vscode_bin="${VSCODE_BIN:-code}"
debug_port="${DEBUG_PORT:-9230}"

for executable in node npm "$vscode_bin"; do
  if ! command -v "$executable" >/dev/null 2>&1; then
    printf 'Required executable not found: %s\nSee docs/development.md\n' "$executable" >&2
    exit 1
  fi
done

if [[ -n "$debug_mode" ]]; then
  if [[ ! "$debug_port" =~ ^[0-9]{1,5}$ ]] || (( 10#$debug_port < 1 || 10#$debug_port > 65535 )); then
    printf 'DEBUG_PORT must be an integer between 1 and 65535.\n' >&2
    exit 2
  fi
fi

if [[ ! -d node_modules ]]; then
  npm ci
fi
npm run compile

mkdir -p .vscode-dev/user-data .vscode-dev/extensions .vscode-dev/workspace
launch_args=(
  --new-window
  "--extensionDevelopmentPath=$project_root"
  "--user-data-dir=$project_root/.vscode-dev/user-data"
  "--extensions-dir=$project_root/.vscode-dev/extensions"
  "$project_root/.vscode-dev/workspace"
)
if [[ -n "$debug_mode" ]]; then
  launch_args+=("--$debug_mode=$debug_port")
  printf 'CLion: Attach to Node.js/Chrome at localhost:%s\n' "$debug_port"
fi

"$vscode_bin" "${launch_args[@]}"
printf '\nIn the development window: Ctrl+Shift+P -> Hello World\n'
printf 'After edits: save, wait for build completion, then Developer: Reload Window.\n'
if "$watch"; then
  printf 'Ctrl+C stops the watcher. Close the development window separately.\n\n'
  exec npm run watch
fi
