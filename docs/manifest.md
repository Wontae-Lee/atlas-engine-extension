# Manifest and Packaging

`package.json` is generated from JSONC files in `config/`. Edit `config/package.jsonc`, `config/scripts.jsonc`, `config/dependencies.jsonc`, or `config/contributions.jsonc`, then regenerate the manifest. `scripts/generate_manifest.py` merges those sources in sorted order and rejects conflicting scalar settings. Keep the generated `package.json` synchronized with its sources.

The manifest declares one Secondary Sidebar container and one simulation tree. Commands register in `ExtensionApp` at activation. Explorer context menus open `atlas.project.json` and import OBJ files; tree item context menus add, edit, and remove entries. The Webview opens as an editor panel from `atlas-engine.scene.open`.

`esbuild.js` bundles the extension and the condition-only Webview. It removes obsolete `dist/runtime/` Python assets. `.vscodeignore` excludes `external/`, source, docs, scripts, and build intermediates from a VSIX. The packaged extension needs its bundled JavaScript/CSS and a published Docker image; it does not need the Git submodule or a local Atlas build.
