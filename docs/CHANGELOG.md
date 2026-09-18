# Change Log

Implemented changes to the "atlas-engine" extension are recorded here.
Unreleased entries do not indicate publication or a successful validation run.

## [Unreleased]

### Added

- Atlas Engine activity bar container and Overview tree view with a Hello World action.
- Class-based commands, views, and editor panel base coordinated by System.
- Automatic package.json generation from project JSONC and TypeScript contributions.
- Python development launcher with isolated VS Code profile, watch mode, and debugger options.
- Docker TBB/CUDA backend selection, persisted mode, status bar, and Output logging.
- CUDA GPU compatibility checks and installation consent before optional image download.
- Container JSON transport, native engine probe, and upstream simulation check command.
- Backend selection, transport failure/cancellation, and VS Code integration tests.

### Changed

- Moved component sources under src/atlas and consolidated internal implementations in detail.
- Consolidated shared functions in src/atlas/detail/private_helpers.ts.
- Adopted one class per file and snake_case filenames and project-owned members.
- Updated development, architecture, manifest, backend, and coding instructions for the current code.
