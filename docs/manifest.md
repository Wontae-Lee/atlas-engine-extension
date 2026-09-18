# Component Registration and Manifest Generation

Declare views, commands, and panels as classes under `src/atlas/` and compose
instances in `createContributions()` in `src/atlas/contributions.ts`. System and
the manifest generator use this same function for runtime registration and
metadata extraction respectively.

Root `package.json` is generated output. Edit its sources and commit the generated
result with the change when regeneration is authorized.

## Sources and Outputs

| Source | Generated information or responsibility |
| --- | --- |
| `config/package.jsonc` | Extension identity, version, activation, compatibility, and entry point |
| `config/scripts.jsonc` | npm scripts |
| `config/dependencies.jsonc` | Dependencies and overrides |
| `createContributions().containers` | `contributes.viewsContainers.activitybar` |
| `createContributions().views` | `contributes.views` and optional `viewsWelcome` |
| `createContributions().commands` | `contributes.commands` |
| `createContributions().panels` | Panel-opening command declarations |
| `scripts/read_contributions.cjs` | Bundle and evaluate composition; extract instance metadata |
| `scripts/generate_manifest.py` | Parse JSONC, merge metadata, and write package.json |

Backend and Streaming are shared services in the composition object. They do not
produce view or command declarations themselves. System controls their runtime
lifetime; see [Architecture](vscode.md#component-ownership).

## Add a Sidebar View

Create `src/atlas/views/projects.ts`:

```ts
import type * as vscode from 'vscode';
import { View } from './view';

export class Projects extends View {
    constructor() {
        super('atlas-engine.projects', 'Projects', 'atlas-engine', 'No projects yet.');
    }

    getChildren(): vscode.TreeItem[] {
        return [];
    }
}
```

Import Projects in `contributions.ts` and add `new Projects()` to `views`, alongside
the existing CASE and section views. Its container ID must exist in `containers`. A new view in the
existing container does not require another container declaration.

The parent View supplies registration, default `getTreeItem()`, refresh events,
and disposal. Return tree content from `getChildren()`. Use `this.api` only after
initialization, never in the constructor. The optional welcome text appears when
the tree is empty.

After regeneration and rebuilding, reload the development window. Projects is an
example, not a currently registered view.

## Add a Command

Create a class extending `Command` in its own snake_case file. Call
`super(id, title)` in its constructor and implement `execute(api, ...args)` using
the injected API. Add its instance to `createContributions().commands`.

System registers the handler and refreshes components after successful execution.
There is no need to add a separate handler in `extension.ts` or manually duplicate
the command in JSON. Preserve published command IDs unless a rename is requested.

For simulation actions, pass the existing Streaming instance into the new command.
To share it in the composition function, assign `new Streaming(backend)` to a local
variable and use that variable for both the `streaming` property and the command's
constructor argument. Do not create an independent session controller per action.

## Add an Editor Panel

Create `src/atlas/panels/inspector.ts`:

```ts
import { Panel } from './panel';

export class Inspector extends Panel {
    constructor() {
        super('atlas-engine.inspector', 'Inspector');
    }

    protected render(): string {
        return '<!DOCTYPE html><html><body><h1>Inspector</h1></body></html>';
    }
}
```

Import Inspector and add `new Inspector()` to `panels`. The generator emits the
`atlas-engine.inspector.open` command, and System registers it to open the panel.
Read the parent's getter as `panel.command_id`, without parentheses.

| Operation | Behavior |
| --- | --- |
| Constructor | Store metadata without opening a tab |
| Open command | Call `show(api)` followed by System update |
| `show(api)` | Reveal the existing tab or create one in the first editor column |
| `render(webview)` | Return HTML synchronously; the argument can provide resource URIs |
| `update()` | Refresh only an open tab, assigning HTML only if changed |
| User closes tab | Release the handle and close subscription; keep the Panel instance |
| Disposal | Release subscriptions and close the tab |

Panels do not produce sidebar `views` declarations. The current `panels` array is
empty; Inspector is only an example. The base class does not enable Webview scripts
or implement message handling.

## Constructor and Import Constraints

Extraction executes code: the reader bundles the composition module in memory,
evaluates it in ordinary Node.js, and calls `createContributions()`. Reachable
module-level code, constructors, field initializers, and metadata getters run
during this process.

Keep these paths free of live VS Code calls, runtime asset reads, UI registration,
file changes, and external process or network activity. Backend connection work
belongs to runtime operations. The generator does not create System or call
command `execute()`, panel `show()`, or panel `render()`.

Use `import type` for VS Code types in modules reachable from composition. The live
API enters through `extension.ts`, then System passes it into initialization and
command/panel operations. Ordinary Node.js cannot supply the `vscode` runtime.

## Generation and Watch

Python 3, Node.js, and installed development dependencies such as esbuild are
required. To generate only the manifest:

```bash
npm run manifest
```

If the generated npm alias is missing or stale, invoke the script directly:

```bash
python3 scripts/generate_manifest.py
```

The development launcher, compile/package commands, and every esbuild build start
invoke generation. Changes to watched TypeScript sources trigger rebuilding;
JSONC-only changes do not trigger watch. Generate manually after JSONC changes,
and regenerate before invoking an npm alias you just changed. Reload VS Code to
apply updated UI declarations.

The generator reads `config/package.jsonc` first, then other JSONC files recursively
in sorted order. It supports line comments, block comments, and trailing commas;
output is plain JSON. Objects merge recursively and arrays concatenate. Conflicting
scalar settings, duplicate JSON keys, invalid component IDs, duplicate IDs within
the checked categories, and missing container references are errors. Panel-opening
commands participate in the command ID uniqueness check.

The generator writes package.json only after extraction and merging succeed, and
only if its content changes. For dependency updates, edit
`config/dependencies.jsonc`, regenerate, then run `npm install` to update the
lockfile. npm edits are not automatically copied back into JSONC sources.
