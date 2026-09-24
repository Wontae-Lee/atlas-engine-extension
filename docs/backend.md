# Docker Backend

`BackendManager` selects TBB or CUDA, checks the Docker server, prepares a published image, and owns one process. `DockerRuntime` constructs the `docker run` command and handles process lifetime. It does not know Interactive command names. `AtlasClient` is the only engine communication API.

The configured image tags are `ghcr.io/wontae-lee/atlas-engine-dev:tbb-ubuntu22.04` and `ghcr.io/wontae-lee/atlas-engine-dev:cuda-ubuntu22.04`. The runtime explicitly starts `/opt/atlas/bin/atlas-interactive` with stdin/stdout connected. It bind mounts the project folder at `/workspace` so CSV and saved states persist outside the temporary container. It does not read or mount `external/atlas-engine`.

TBB is the default. CUDA selection checks `--gpus all` access and compute capability with the TBB image, asks before downloading a missing CUDA image, and adds NVIDIA graphics/display driver capabilities. A new process must validate the current simulation through Interactive before it replaces the old process. The old session is closed to flush CSV output during a successful switch. A local X11 display socket and `DISPLAY` are passed when present. Without display access, simulation and validation remain usable; `render_open` returns an engine error. Native window closure does not close or pause the simulation session.

Process stderr goes to **ATLAS ENGINE LOG**; stdout is reserved for JSONL responses. A failed `validate` or `render_open` response rejects that request and leaves the process available. Process exit, malformed stdout, or invalid response correlation invalidates the connection and current session. The status bar shows backend and session state separately.

Image tags are mutable. The extension's protocol follows the pinned development submodule, so a published image must contain a compatible `atlas-interactive`. The future release version/tag policy is outside this refactor.
