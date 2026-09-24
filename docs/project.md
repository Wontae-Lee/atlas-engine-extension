# Project Files and Validation

A project folder contains:

```text
atlas.project.json       editable extension model
atlas.simulation.json    generated Atlas Interactive config
assets/geometry/         imported OBJ files
output/                  native CSV output
state/time_step_*/       native fluid.bin and universe.bin from Save State
```

`atlas.project.json` has `version: 1`, `simulation`, `geometries`, `assets`, and `output`. `simulation` follows the native Interactive schema, except a Unit may refer to a shared `geometry_id`, and a `triangle_mesh` may refer to an imported `asset_id`. `ConfigSerializer` expands these references; `atlas.simulation.json` contains only native engine fields.

Every simulation parameter edit creates a candidate project. The extension serializes the whole relevant object and asks `atlas-interactive` to validate it. Materials use `material`, Universe fields use `universe`, solvers use `solver`, emitters use composite `emitter` with materials, colliders use `collider`, sinks use `sink`, and changes affecting the entire simulation use `simulation`. Shared geometry changes also validate their resolved geometry and the complete simulation. An engine error leaves the previous project value and files intact.

The extension checks only editor integrity, such as known geometry and asset IDs, OBJ syntax, safe asset paths, a local CSV filename, and whether the project file changed outside the extension. Reopen a changed file before continuing with tree edits. Atlas Core decides semantic and numerical validity. The project does not serialize Fluid or Universe binary state. The native `save` command writes it to the mounted `state/` directory. Restore is unavailable in the current Interactive protocol.

The extension uses local filesystem paths because the Docker process bind mounts the project folder. A remote Docker daemon must be able to access that same host path. The project's files are visible in the ordinary VS Code Explorer.
