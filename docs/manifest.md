# Component Registration and Manifest Generation

`package.json` is generated from JSONC configuration and the same class composition
used at runtime. Edit the sources below; regenerate the manifest when execution
is authorized, and include its changes with the feature.

## Sources and Outputs

| Source | Responsibility |
| --- | --- |
| `config/package.jsonc` | Identity, version, compatibility, activation, and entry point |
| `config/scripts.jsonc` | npm scripts |
| `config/dependencies.jsonc` | Dependencies and overrides |
| `src/atlas/contributions.ts` | Construct shared services, Layout, and commands |
| `layout.containers` | Containers at `activitybar`, `secondarySidebar`, or `panel`, and their native views |
| `commands` | Explicit command declarations |
| `layout.center.views` | Editor-opening commands derived from `command_id` and title |
| `scripts/read_contributions.cjs` | Bundle composition in memory and extract metadata |
| `scripts/generate_manifest.py` | Parse JSONC, merge contributions, and write plain JSON |

The composition object contains `catalog`, `project`, `backend`, `streaming`,
`layout`, and `commands`. Containers and editor views belong to Layout; there are
no separate top-level `views` or `panels` registries.

## Add a Native View

Place the class in the relevant directory under `src/atlas/views/`: `left`,
`right`, or `bottom`. Use one class per snake_case file. A simple native tree
extends `View`, calls `super(id, title, visibility?)`, and overrides
`getChildren(element?)`. The base supplies registration, refresh, and disposal.
VS Code-required member names retain the API's spelling.

Add the instance to its region's composition. `Left` and `Right` are containers;
`Bottom` composes panel containers so its views appear as bottom tabs. The
manifest reader emits each container's own views. A new view inside an existing
container does not require another container declaration.

For editable case sections, follow the existing left views rather than adding
field metadata to CaseProject. `ProjectView` provides shared editing behavior,
and `EntryView` provides collection operations. Each concrete section owns its
fields and action handling. `Left.execute()` routes actions by section. New case
concepts also require corresponding model types, validation, conversion, and
runtime support; a view declaration alone does not implement engine behavior.

Preserve the current ownership: SOLVERS configures the solver, OUTPUT owns
observer settings and exports, and Simulation owns execution controls.

## Add a Command

Extend `Command` in `src/atlas/commands/`, call `super(id, title)`, and implement
`execute(api, ...args)`. Inject the existing services it needs and add the instance
to `createContributions().commands`. System registers the handler and updates the
layout after successful execution. Do not duplicate registrations in
`extension.ts` or generated JSON.

The registered explicit commands select/check the backend, show the layout, and
edit the project. Simulation's open command is generated from its editor view.
Preserve public command and view IDs unless changing them is part of the task.

## Add an Editor View

Place the class under `views/center/` and compose it in `Center`. `EditorView` is
the shared Webview lifecycle base; `SimulationView` specializes it for the current
simulation and `Scene` supplies the concrete view metadata. There is no current
`src/atlas/panels/` implementation.

The generator emits an opening command for each center view. System initializes
editor views with the live VS Code API and extension URI. Opening creates or
reveals one tab; closing releases that tab's subscriptions. Updates send data to
a ready, visible webview rather than replacing its HTML on every snapshot.

Browser code and styles belong in `src/atlas/views/center/webview/`. If a new editor needs its
own browser entry, update `esbuild.js` and its local resource handling. Keep
browser code independent of Node.js and the live `vscode` module. Use the existing
nonce-based CSP, message validation, and lifecycle conventions.

## Constructor and Import Constraints

The reader executes reachable imports, constructors, field initializers, and
metadata getters in ordinary Node.js when it calls `createContributions()`.
These paths must be free of live VS Code calls, runtime asset reads, UI
registration, file mutations, external processes, and network activity.

Use `import type` for VS Code types reachable from composition. The live API
enters through `extension.ts` and is injected during initialization. Runtime
Python files are loaded when opening a backend connection, not during metadata
extraction. The reader does not initialize System or open editor tabs.

## Generation and Watch

Python 3, Node.js, and installed npm dependencies are required:

```bash
npm run manifest
# Equivalent direct entry point when the generated npm alias is stale:
python3 scripts/generate_manifest.py
```

The launcher, compile/package scripts, and esbuild build-start hook invoke
generation. Watched TypeScript edits cause rebuilds, but JSONC-only edits do not
trigger watch: generate explicitly after changing configuration. Reload the
development window to load new contribution declarations.

The generator reads `config/package.jsonc` first and other JSONC files recursively
in sorted order. It supports comments and trailing commas. Objects merge
recursively and arrays concatenate; conflicting scalar fields, duplicate JSON
keys, and non-finite JSON numbers are rejected. The reader checks nonempty,
unique IDs for containers, views, and commands, including editor-opening commands,
and rejects unsupported container locations.

`package.json` is written only after successful extraction and merging, and only
when its content changes. For dependency changes, edit JSONC, regenerate, then
update `package-lock.json` with npm. npm edits are not copied back to JSONC.
`npm run package` builds production assets; it does not create or publish a VSIX.

See [Development workflow](development.md) for commands and the explicit-request
rule governing agent execution.
