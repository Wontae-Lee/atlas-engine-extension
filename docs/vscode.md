# Extension Architecture

`ExtensionApp` owns the editable `Project`, `ProjectStore`, `ConfigSerializer`, `BackendManager`, one `AtlasClient`, and the current `ActiveSession`. `src/extension.ts` creates the app and registers it for disposal.

```text
Explorer (real files)       ATLAS SIMULATION tree (parameter input)
          |                              |
          |                     candidate Project edit
          |                              |
          |                   ConfigSerializer → AtlasClient.validate
          |                              |
          +---- ProjectStore ← accepted Project
                                    |
                           Simulation Webview
                           conditions + controls
                                    |
                                ExtensionApp
                                    |
                              AtlasClient
                                    |
                         native atlas-interactive
                                    |
                             native renderer
```

The project model and remote session are separate. Each committed edit advances the project revision; the active session records the revision used by `create`. When they differ, the Webview shows that Apply is needed. A backend process replacement invalidates all remote session IDs and clears `ActiveSession`.

The built-in Explorer owns files. The single Secondary Sidebar tree owns parameter entry. The central Webview draws committed conditions and sends validated control messages to the host. It does not draw particles. The native Atlas renderer owns live particle display. An Output channel shows Docker and engine stderr. Status bar items show backend and session states separately.

The tree reflects `atlas.project.json`. Fields are JSON values; adding an object uses the current Atlas Interactive JSON shape. `ParameterEditor` collects input. `ExtensionApp` clones a candidate, serializes the relevant Core construction target, calls `AtlasClient.validate`, then persists and commits only on success. Output filename settings are extension file policy, not Atlas simulation parameters. Atlas provides no partial `output` validation target.

`ConfigSerializer` resolves geometry IDs and OBJ assets into native JSON. The same serializer supplies partial validation and complete `create` configuration. The Webview receives a `SimulationViewModel` derived from the committed project, not engine particle state.
