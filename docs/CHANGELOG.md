# Changelog

Implemented changes to Atlas Engine Extension. Unreleased entries do not imply
publication or a successful validation run.

## [Unreleased]

### Added

- Documented the deferred visualization performance plan, current JSON snapshot
  bottleneck candidates, and proposed validation; runtime behavior is unchanged.

- Editable ATLAS sidebar sections: DOMAIN, ASSETS, MATERIALS, GEOMETRY, SOURCES,
  BOUNDARIES, SINKS, SOLVERS, and OUTPUT.
- Default nitrogen case with a radius-0.5 sphere collider at the origin, a
  positive-X inlet from the negative-X domain face, and domain bounds of
  `[-1, -1, -1]` to `[1, 1, 1]`.
- Workspace-persisted case settings, validation, and applied-revision tracking.
- Independent OBJ assets copied into workspace `assets/geometry`, with relative
  paths, replacement/reveal actions, and reference validation.
- Molecular catalog with separately sourced VHS/VSS presets, provenance,
  parameter editing, and model compatibility checks.
- Central Simulation webview with Apply, Start, Pause, Step, and Reset, local
  geometry/OBJ preview, camera controls, and sampled live particle rendering.
- Right SIMULATION STATUS tree with full-snapshot statistics, species counts,
  and bounded recent history; bottom SIMULATION LOG tab with state and progress.
- Particle and statistics CSV exports in OUTPUT, alongside observer settings.
- Docker TBB/CUDA selection, persisted mode, native connection checks, status bar,
  Output diagnostics, GPU preflight, and consent before optional CUDA download.
- Ordered JSON request transport and Streaming middleware for persistent engine
  initialization, stepping, continuous execution, pause, reset, and closure.
- Packaged EngineServer, EngineSession, and EngineScene Python runtime with
  geometry, sources, colliders, sinks, observers, and automatic domain escape removal.
- JSONC and TypeScript contribution-based manifest generation; isolated Python
  development launcher with watchers and debugger options.
- Test sources for catalog, project/defaults, view ownership, simulation controls,
  webview lifecycle, preview geometry, backend, transport, and streaming contracts.

### Changed

- Organized views by left, right, bottom, and center regions under `src/atlas/views`.
- Moved sidebar field/action ownership into concrete views; kept CaseProject
  responsible for configuration, validation, persistence, and engine conversion.
- Kept execution controls in Simulation, solver settings in SOLVERS, statistics
  in the right sidebar, and exports in OUTPUT.
- Consolidated shared helpers in `src/atlas/detail/private_helpers.ts` and adopted
  one class per file with snake_case filenames and project-owned members.
- Added webview readiness/visibility handling, coalesced updates, scene asset
  acknowledgement, and lifecycle cleanup.
- Updated all development documents for the current implementation and rewrote
  README around setup, first use, UI responsibilities, and current limitations.
- Updated AGENTS.md as a documentation map and corrected links for the moved
  `docs/coding-style.md` file.

### Removed

- CASE/Overview and Hello World placeholders, the separate Results view, and
  duplicate sidebar execution controls.
- Dedicated load-nitrogen command and case factory module; fresh workspace
  defaults now come from CaseProject.
- Temporary example bridge, replaced by the persistent streaming runtime.
