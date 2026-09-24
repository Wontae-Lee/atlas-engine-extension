# Atlas Engine Extension

A VS Code frontend for the native Atlas Interactive application. Edit simulation conditions in the **ATLAS SIMULATION** tree in the Secondary Sidebar, use the **Atlas Simulation** editor for a condition preview and runtime controls, and open the native renderer to see live particles.

Atlas Core performs simulation and validation. The extension communicates with `atlas-interactive` inside a published TBB or CUDA Docker image. It does not install Atlas locally or transfer particle arrays into VS Code.

## Requirements

- VS Code compatible with `engines.vscode` in `config/package.jsonc`.
- Docker CLI and a Linux x86-64 Docker server with access to the project folder.
- For CUDA, an NVIDIA GPU, driver, and Container Toolkit supported by the selected image.
- For the native window, a local X11 display accessible to Docker. Headless simulation works without it.

## Start

1. Open a local workspace folder in VS Code.
2. Run **Atlas Engine: Create Project**. The extension creates `atlas.project.json`, `atlas.simulation.json`, `assets/geometry/`, `output/`, and `state/` in that folder.
3. Select **Atlas Engine: Select Backend** if you want CUDA; TBB is the default. The extension downloads missing images and validates the current simulation through Atlas Interactive.
4. Expand **ATLAS SIMULATION** in the Secondary Sidebar. Select a value to edit it as JSON. Use an array item's context menu to add or remove objects. An edit is saved only after the engine accepts its validation target.
5. Open **Atlas Engine: Open Simulation**. **Apply** creates a native session. **Start**, **Pause**, **Step**, **Restart**, and **Save State** control that session. **Open Renderer** opens the native Atlas window when a display is available.

The built-in Explorer shows project, asset, output, and state files. Right-click an OBJ file to import it as an Atlas geometry asset. The condition preview draws configured bounds and geometry; live particles appear only in the native renderer.

Changing a setting after **Apply** leaves the current session on its previous revision until you apply again. Applying creates a new session before closing the old one, so a rejected configuration leaves the old session available. Switching backend clears the active session.

`atlas.project.json` is the editable extension model. `atlas.simulation.json` is generated engine configuration. Atlas writes CSV under `output/` when enabled and saved binary state under `state/time_step_*/`. Atlas Interactive currently has no restore command; **Save State** does not offer restore.

## Development

See [development setup](docs/development.md), [architecture](docs/vscode.md), [project format](docs/project.md), [backend](docs/backend.md), and [Interactive protocol](docs/interactive.md). `external/atlas-engine` is a development submodule and is excluded from the extension package.
