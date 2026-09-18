# Extension Architecture

`src/extension.ts` creates the extension's `System` and calls `system.update()`.
System owns registration, command execution, refresh order, and disposal.
Components implement their own behavior through classes; the composition function
in `src/atlas/contributions.ts` creates their instances.

## Runtime and Manifest

VS Code reads the generated `package.json` to discover the extension's entry point
and UI contributions. It loads `dist/extension.js` in the Extension Host, where
the `vscode` runtime API is available. TypeScript sources are build inputs, not
the files VS Code executes.

The current manifest requests startup activation with `onStartupFinished`.
Activation creates System, registers it in `context.subscriptions`, and calls
its first update. Backend connection work continues asynchronously.

```ts
import * as vscode from 'vscode';
import { System } from './atlas/system/system';

export function activate(context: vscode.ExtensionContext) {
    const system = new System(vscode, undefined, context.globalState);
    context.subscriptions.push(system);
    system.update();
}

export function deactivate() {}
```

The registered System is disposed through the extension context. JavaScript
garbage collection does not call `dispose()` automatically.

Metadata declares that a command or view exists; runtime registration supplies
its behavior. Both must use the same ID. This repository generates metadata from
component instances and lets System register those same declarations at runtime.
See [Manifest generation](manifest.md) for the extension points and examples.

## Component Ownership

```text
System
├── Backend       Docker selection, preparation, and connection lifetime
├── Streaming     Simulation session, requests, and result subscriptions
├── View[]        Overview extends View
├── Command[]     HelloWorld, SelectBackend, CheckBackend
└── Panel[]       Empty; concrete editor panels can be added
```

`createContributions()` creates one Backend and one Streaming using that Backend.
Future simulation commands or panels should receive this same Streaming instance
through their constructors. Backend does not own simulation configuration or
particle state; Streaming does not install images or select Docker modes.

System's constructor initializes backend UI and views, then registers command
callbacks and panel-opening callbacks. Each successful command completion calls
`update()`. Panel-opening callbacks call `show(api)` and then `update()`.

`update()` calls Backend, views, then panels. Backend begins its startup connection
only once. Views request a tree refresh; panels refresh only existing tabs.
Updates do not register components again or start a System timer. Repeated
simulation requests start only through an explicit `Streaming.start()` call.

Disposal stops Backend first, then Streaming, then releases command registration
handles, panels, commands, and views. Backend-first disposal announces connection
loss before remaining simulation resources are released.

## Source Map

| Path | Responsibility |
| --- | --- |
| `src/extension.ts` | Live VS Code import and activation entry point |
| `src/atlas/contributions.ts` | Component composition and metadata instances |
| `src/atlas/system/system.ts` | Registration, execution, refresh, and disposal order |
| `src/atlas/backend/` | Docker backend controller, transport implementation, and contracts |
| `src/atlas/streaming/` | Engine control and simulation data contracts |
| `src/atlas/streaming/runtime/` | Python server and persistent Atlas session inside the container |
| `src/atlas/views/` | Tree View base class and Overview implementation |
| `src/atlas/commands/` | Command base class and executable actions |
| `src/atlas/panels/` | Editor Webview Panel base class |
| `src/atlas/detail/` | Internal implementations used by any component area |
| `src/atlas/detail/private_helpers.ts` | Single location for repeated internal helper functions |
| `config/*.jsonc` | Project metadata, npm scripts, and dependencies |
| `scripts/` | Development launcher and manifest extraction/merging |
| `test/` | Backend, transport, Streaming, and extension tests |
| `test/helpers/` | Substitute implementations, one class per file |
| `media/` | Extension image assets |

`detail` is shared across component areas, not reserved for Backend. Keep stateful
classes in separate snake_case files and common functions in `private_helpers.ts`.
Do not introduce a parallel `helpers.ts` or `src/atlas/private_helpers.ts` for the
same purpose. Follow [Coding style](guidelines/coding-style.md) for naming and
extraction decisions.

## UI Boundaries

Overview is an empty tree under the Atlas Engine activity-bar container. Its
welcome contribution displays the Hello World action. `View.initialize()`
registers its provider, `getChildren()` provides items, and `update()` fires the
change event. Preserve VS Code-required method names such as `getChildren()` and
`getTreeItem()` even though project-owned members use snake_case.

An editor `Panel` is separate from a sidebar `View`. Panel instances store metadata
at construction; their open commands create or reveal a Webview tab. `render()`
returns HTML synchronously and `update()` replaces it only when changed. Closing
the tab leaves the component instance available for reopening.

The current Panel base uses empty Webview options and has no script messaging
implementation. Adding HTML containing JavaScript alone does not provide an
interactive simulation UI. No concrete panel or simulation UI is registered.

Backend uses its own status bar, selection prompts, progress notifications, and
Output channel. See [Backend](backend.md) for selection and connection behavior.
Streaming emits state and snapshot notifications without calling the VS Code UI
API; the consuming command, view, or panel determines how to present them.

## Build and Distribution

```text
config/*.jsonc + src/atlas/contributions.ts
    → scripts/generate_manifest.py → package.json
src/extension.ts and imports
    → tsc --noEmit → ESLint → esbuild → dist/extension.js
streaming/runtime/*.py
    → esbuild asset copy → dist/runtime/*.py
package.json main
    → VS Code Extension Host
```

TypeScript checks types; esbuild creates the JavaScript bundle. `vscode` is
external to the bundle because the host supplies it. Development builds include
`dist/extension.js.map`; production builds are minified without source maps.
The Python runtime assets must accompany both builds.

`package.json` is tracked generated output. Edit its JSONC or TypeScript sources
and regenerate it when execution is authorized. Constructors and reachable module
initializers used during manifest extraction must not call live VS Code APIs,
read runtime assets, register UI, or start external work. Details are in
[Manifest generation](manifest.md#constructor-and-import-constraints).

For launch, reload, debugging, and test procedures, use
[Development workflow](development.md). For engine requests and result lifetime,
use [Streaming](streaming.md).
