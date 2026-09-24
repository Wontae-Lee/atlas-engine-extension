# Changelog

## [Unreleased]

### Added

- Native Atlas Interactive JSONL client and process-level Docker runtime for TBB and CUDA.
- Workspace project files, generated native simulation JSON, persistent output/state folders, and OBJ asset import.
- One Secondary Sidebar simulation tree with engine-validated candidate edits.
- Condition-only Simulation Webview, native renderer controls, backend/session status, and engine log.
- Development-only Atlas Engine submodule tracking its `main` line and package exclusion.

### Changed

- Rebuilt the extension around `ExtensionApp`, `Project`, `ConfigSerializer`, `BackendManager`, and `AtlasClient`.
- Split human documentation from repository agent instructions.

### Removed

- Python runtime injection, extension-owned Streaming, particle snapshots, Webview particle drawing, and snapshot-derived statistics.
- Legacy multi-view left/right/bottom layout and tests tied to the removed runtime.

### Verification sources

- Added contract tests for JSONL request failures, shared geometry serialization, and OBJ syntax.
