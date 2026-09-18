# Development Workflow

Edit TypeScript in CLion and run the extension in VS Code's Extension Host.
VS Code supplies the `vscode` module; do not run `src/extension.ts` or
`dist/extension.js` directly with Node.js.

For component ownership, see [Architecture](vscode.md). For adding features and
updating the generated manifest, see [Manifest generation](manifest.md).

## Prerequisites

The launcher uses Python 3 standard-library modules and targets Linux/macOS.
This repository is developed on Linux. Install Node.js, npm, Python 3, and a
VS Code version compatible with `engines.vscode` in `config/package.jsonc`.
The current declared range is `^1.138.0`.

From the repository root:

```bash
node --version
npm --version
python3 --version
code --version
npm ci
```

Configure CLion's JavaScript/TypeScript support and Node.js runtime, using the
project's `node_modules/typescript` for TypeScript support. The local Node.js
runtime and Extension Host runtime can have different versions.

If the VS Code CLI is outside PATH, provide its executable path:

```bash
VSCODE_BIN=/snap/bin/code npm run dev
```

`VSCODE_BIN` accepts one executable, without command-line options. Run `npm ci`
after dependency or lockfile changes; the launcher only checks whether
`node_modules` exists and does not repair an outdated installation.

A working Docker CLI and Linux x86-64 Docker server are required for the actual
backend connection. See [Backend](backend.md) for GPU requirements.

## Launch and Manually Check the Extension

```bash
npm run dev
```

The launcher checks prerequisites, installs dependencies if absent, generates the
manifest, runs type checking and lint, builds the bundle, opens an isolated
VS Code development window, and starts the TypeScript/esbuild watchers.
A failed initial build prevents the window from opening.

1. Click the ATLAS logo in the development window's activity bar.
2. Expand CASE to see the Overview and Domain placeholders.
3. Expand the other sidebar sections; no editor tab or HTML window is opened.
4. Inspect `atlas-engine-backend` in the status bar and its Output channel for
   the separate backend connection result.

The sidebar contains CASE, ASSETS, MATERIALS, GEOMETRY, SOURCES, BOUNDARIES, SINKS,
SOLVERS, and OUTPUT in that order. These are UI shells without sample objects,
file operations, configuration fields, or simulation controls. Hello World remains
available through the command palette. The launcher does not click commands or
verify their results automatically.

Startup activation connects to the saved backend, or TBB on first use. It can
download a missing image. An activation log does not mean this asynchronous
connection has succeeded.

Stop the watcher with `Ctrl+C` and close the development window separately.
Closing the window does not stop the watcher. Stop existing watchers before
launching another instance.

## Edit and Reload

1. Save changes in CLion.
2. Wait for esbuild to finish and check TypeScript diagnostics.
3. Run **Developer: Reload Window** in the development window.
4. Exercise the changed feature again.

Watch mode rebuilds files; it does not replace code already loaded by the
Extension Host. esbuild can emit output despite errors reported by the separate
TypeScript watcher. ESLint runs during the initial compile, not continuously.

Source rebuilds regenerate the manifest. Changes only to `config/*.jsonc` require
manual generation; see [Manifest generation](manifest.md#generation-and-watch).
Python runtime edits trigger an esbuild rebuild and are copied to `dist/runtime/`.
Reload the development window so a new container loads the updated runtime.

Development data is retained under the Git-ignored `.vscode-dev/` directory:

| Directory | Purpose |
| --- | --- |
| `user-data` | Development settings and persisted state |
| `extensions` | Extensions installed in the development profile |
| `workspace` | Scratch workspace for manual checks |

The launcher does not delete these directories. Extensions installed in this
profile can load on subsequent launches.

## Debug from CLion

Close the previous development window and watcher before enabling the inspector:

```bash
npm run dev:debug
```

Create an **Attach to Node.js/Chrome** run configuration in CLion:

| Setting | Value |
| --- | --- |
| Name | `Atlas Extension Host` |
| Host | `localhost` |
| Port | `9230` |
| Reconnect automatically | Enable if available |

Set a breakpoint in `src/atlas/commands/hello_world.ts`, attach the debugger, then
execute Hello World in the development window. Inspect variables and the call
stack when execution stops.

To stop before activation, use:

```bash
npm run dev:debug:break
```

Attach and resume the Extension Host. It waits for the debugger before executing
extension code. Reattach after a reload if the connection is lost.

To use another port, change both the launcher and CLion configuration:

```bash
DEBUG_PORT=9231 npm run dev:debug
```

If a breakpoint is not reached, check the target inspector port, the current
`dist/extension.js` and source map, the repository path, whether the window was
reloaded after building, and whether the relevant command actually ran.
Production bundles omit source maps; use a development build for debugging.

## CLion Run Configurations

Create an **npm** configuration targeting the root `package.json`, with Command
`run` and Scripts `dev`. For debugging, use Scripts `dev:debug` and start the
separate Attach configuration. Debugging npm itself targets a different process.
Do not use the long-running watcher as a before-launch task that must finish.

Alternatively, configure Python 3 with Script path `scripts/dev.py`, or run:

```bash
python3 scripts/dev.py
```

The launcher resolves the repository from its own path, so it does not depend on
the IDE's working directory.

## Checks and Tests

Run these when validation is intended:

```bash
npm run compile
npm test
```

`compile` generates the manifest, checks types, runs ESLint, and bundles the
extension plus Python runtime assets. `npm test` first runs `pretest`, compiling
tests under `out/` and building the extension, then starts the VS Code test runner.

`.vscode-test.mjs` selects `out/test/**/*.test.js` and stable VS Code. Downloads
and test data are cached under `.vscode-test/`; the selected VS Code must satisfy
the manifest's supported version range.

| Test source | Coverage implemented in source |
| --- | --- |
| `test/extension.test.ts` | Activation, Hello World execution, backend command declarations |
| `test/backend.test.ts` | Backend selection, consent, replacement, cancellation, and connection notifications using substitutes |
| `test/docker.test.ts` | Process and JSON transport failures, cancellation, and owned-container cleanup using a temporary executable |
| `test/streaming.test.ts` | Session operations, ordered requests, pause/resume, invalid responses, and stale-result rejection using substitute connections |

Substitute connections and executables do not verify the real Python runtime or
TBB/CUDA execution. Extension integration tests activate the extension, which can
start a real backend connection and image download. Check visible UI behavior
and real engine execution separately when those changes require validation.

For Linux environments without a display, if Xvfb is installed:

```bash
xvfb-run -a npm test
```

The sidebar-only UI passed manifest generation, type checking, lint, and bundling.
No test suite or real Docker/simulation validation was run for this update; a
successful build does not verify engine execution or visual behavior.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Hello World is missing | Development window, successful build, supported VS Code version, generated manifest |
| Old behavior remains | Save, wait for build completion, then reload the development window |
| Cannot find module `vscode` | Use the Extension Host, not ordinary Node.js |
| VS Code CLI is missing | PATH or `VSCODE_BIN` |
| Missing build dependencies | Run `npm ci` from the repository root |
| Test download fails | Network, proxy configuration, and test-runner output |
| Test process reports display errors | Desktop session or Xvfb |
| Backend remains disconnected | `atlas-engine-backend` Output and [backend setup](backend.md) |

`DEP0169` (`url.parse`) and `DEP0040` (`punycode`) are deprecation warnings; their
presence alone does not establish extension failure. A console-forwarder location
does not identify the originating package. Inspect **Log (Extension Host)** or
**Developer: Toggle Developer Tools** and obtain the warning stack before
assigning a cause. Apply `--trace-deprecation` to the process emitting the warning;
setting it only on the watcher does not trace a separate Extension Host.

The project's activation message is:

```text
Congratulations, your extension "atlas-engine" is now active!
```

## Command Reference

| Command | Purpose |
| --- | --- |
| `npm run dev` | Build, open the development window, and watch |
| `npm run dev:debug` | Launch with inspector port 9230 |
| `npm run dev:debug:break` | Wait for a debugger before Extension Host execution |
| `npm run dev -- --no-watch` | Build and launch once |
| `npm run dev -- --help` | Show launcher options |
| `npm run manifest` | Regenerate package.json |
| `npm run watch` | Watch TypeScript and esbuild without opening VS Code |
| `npm run check-types` | Type-check sources and tests without emitting files |
| `npm run lint` | Lint src; test/ is not included |
| `npm run compile` | Generate manifest, check types, lint, and build |
| `npm run compile-tests` | Emit compiled tests and source under out/ |
| `npm run watch-tests` | Recompile tests on changes without executing them |
| `npm test` | Run pretest and the VS Code test suite |
| `npm run package` | Produce a minified release bundle; does not create or publish a VSIX |

These commands are developer procedures. Agent execution remains subject to the
explicit-request rule in [AGENTS.md](../AGENTS.md).
