# Atlas Engine for VS Code

Configure and visualize DSMC simulations from VS Code, using an Atlas Engine
backend running in Docker. Start with the built-in nitrogen case, edit your
geometry and materials, and watch particle positions as the engine advances.

## Start from source

You need:

- VS Code compatible with the repository's declared requirement, `^1.138.0`.
- Node.js and npm compatible with the locked development dependencies; Node.js
  24 satisfies the current ESLint runtime requirement.
- Python 3 for the development launcher and manifest generator.
- Docker CLI access to a running **Linux x86-64 Docker server** for simulations.

From the repository directory:

```bash
npm ci
npm run dev
```

The launcher builds the extension, opens an isolated VS Code development window,
and watches for changes. Its settings and scratch workspace are kept in
`.vscode-dev/`. The extension opens the Atlas layout and starts preparing the
backend. On first use it selects **TBB (CPU)** and downloads the image if needed.
Opening the UI does not start a simulation.

If the layout is hidden, open the Command Palette and run
**Atlas Engine: Show Layout**. For CLion setup, debugging, or a custom VS Code
executable, see the [development guide](docs/development.md).

## Run your first simulation

1. Wait for `atlas-engine-backend` in the status bar to report Ready.
2. Inspect the initial case in the ATLAS sidebar.
3. In the central **Simulation** tab, click **Apply to Engine**.
4. Click **Step** to advance once, or **Start** to run continuously.
5. Click **Pause** to stop advancing. Use **Reset** to return the applied case
   to step zero.

The initial case uses nitrogen (N₂, VHS), a sphere collider centered at `(0, 0, 0)`
with radius `0.5 m`, and a square inlet at `x = -1 m` emitting toward positive X.
The domain runs from `(-1, -1, -1)` to `(1, 1, 1)` metres. Particles outside the
Domain are removed automatically; there is no switch to enable that behavior.

Editing a case changes its saved settings. **Pause, then Apply to Engine** to
replace the running configuration with those changes. Replacing an existing
simulation asks for confirmation. Reset restores the applied initial
configuration; it does not restore the sidebar's default nitrogen settings.

## Where things live

| Area | What to do there |
| --- | --- |
| Left: DOMAIN | Set bounds and cell size |
| Left: ASSETS | Import and manage OBJ files |
| Left: MATERIALS | Choose VHS/VSS catalog presets and edit material properties |
| Left: GEOMETRY, SOURCES, BOUNDARIES, SINKS | Build the simulation case |
| Left: SOLVERS | Edit DSMC solver settings |
| Left: OUTPUT | Configure the observer and export snapshot CSV files |
| Center: Simulation | View geometry and particles; Apply, Start, Pause, Step, Reset |
| Right: SIMULATION STATUS | Inspect state, counts, speeds, species, and recent snapshots |
| Bottom: SIMULATION LOG | Read simulation state changes, progress, and errors |
| Status bar: atlas-engine-backend | Choose or check the Docker backend |

In the Simulation canvas, drag to orbit, Shift-drag or right-drag to pan, and
scroll to zoom. **Fit** and the camera selector help frame the scene. The
Domain, Geometry, and Particles checkboxes control visibility.

## Meshes, saved settings, and output

**ASSETS → Import Mesh Asset** copies an OBJ into the chosen workspace's
`assets/geometry/` directory. A Geometry item can then reference that asset.
Importing a file alone does not create a simulation object. Sphere, Box, and
other built-in shapes do not need an asset file.

Case settings are saved in VS Code's workspace state. There is currently no
`atlas.jsonc` project-file import/export workflow. OBJ records use a relative
asset path plus the owning workspace URI; moving or cloning a folder does not
by itself transfer the saved case settings.

Under **OUTPUT**:

- **Export Particle Snapshot CSV** saves positions, velocities, and species for
  the last received snapshot to a location you choose.
- **Export Snapshot Statistics CSV** saves totals, mean/RMS speed, and species
  counts for that snapshot.
- **CSV observer** settings control engine-side output inside the Docker
  container. These files are separate from manual exports and are removed with
  the container; there is no automatic download of observer output.

## CPU and CUDA

TBB works without an NVIDIA GPU. To use CUDA, click `atlas-engine-backend` and
select **CUDA**. The extension checks GPU access through Docker before asking to
download a missing CUDA image. It does not install drivers or NVIDIA Container
Toolkit. See [backend setup and troubleshooting](docs/backend.md).

## Current limits

- Geometry is a wireframe preview of the configured **initial pose**. Moving
  collider poses are not streamed to the canvas; particle positions are live.
- The canvas displays at most 20,000 sampled particles. Statistics and manual
  CSV exports use the full received snapshot.
- OBJ preview supports up to 500,000 vertices and 250,000 triangles; it does not
  import MTL files or textures.
- Catalog entries are reference parameter sets. VHS and VSS availability varies
  by species; the catalog does not provide chemistry or internal-energy
  relaxation models.

For implementation details, validation procedures, and contribution rules, use
[the documentation index](docs/README.md). Implemented features are listed in the
[changelog](docs/CHANGELOG.md).
