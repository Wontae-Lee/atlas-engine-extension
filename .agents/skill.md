# Repository Agent Instructions

Read `docs/coding-style.md` and the task-relevant documents in `docs/README.md` before editing. Keep changes within scope and preserve existing user changes. Record implemented changes under Unreleased in `docs/CHANGELOG.md`.

`external/atlas-engine` is a development-only submodule following the engine's `main` line. Inspect its Interactive source and documentation for protocol changes. Do not edit, build, test, format, or commit within the submodule from extension tasks. Do not bundle it or use its build output at runtime.

The extension talks only to native `atlas-interactive` in a published Docker image. `AtlasClient` is the sole engine command API; `BackendManager` selects backends and owns process lifecycle without interpreting engine commands. `Project` stores committed conditions separately from `ActiveSession`. Every simulation parameter edit must ask engine `validate` before commit. The single simulation tree owns parameter input. The Webview visualizes committed conditions and exposes controls; it never renders particles. Keep docs human-facing.

`package.json` is generated from `config/*.jsonc`. Edit sources first. Do not run builds, tests, benchmarks, simulations, generators, or formatters unless the user explicitly requests them. Report source inspection separately from executed checks; do not present historical results as validation of current changes.
