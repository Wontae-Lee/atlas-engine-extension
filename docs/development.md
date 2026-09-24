# Development Workflow

Clone with the development-only Atlas Engine submodule:

```bash
git clone --recurse-submodules https://github.com/Wontae-Lee/atlas-engine-extension.git
cd atlas-engine-extension
git submodule update --init --recursive
```

To follow the engine's `main` development line, update the submodule pointer during a deliberate protocol update:

```bash
git submodule update --remote external/atlas-engine
```

Inspect `external/atlas-engine/src/interactive/`, `docs/frontends/interactive.md`, `examples/interactive/`, and `docs/architecture/` before editing wire configuration or commands. Do not modify or test Atlas Engine as part of extension work. The submodule is a specification reference; TypeScript does not import its build output.

Use Node.js, npm, Python 3, and a compatible VS Code installation. `npm ci` installs extension development dependencies. `npm run dev` generates the manifest, checks TypeScript and lint, bundles the extension and Webview, then opens an isolated Extension Host. `npm run dev:debug` enables the Node inspector on port 9230. Stop watchers separately from the VS Code window.

For a deliberate validation run, `npm run compile` checks types, lint, and bundles. `npm test` runs the VS Code test runner. These commands do not exercise a real TBB/CUDA simulation or native window. Manual checks require a Docker server and published image with the native `atlas-interactive` executable.
