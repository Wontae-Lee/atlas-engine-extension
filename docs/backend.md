# Docker Backend

Backend owns image preparation, backend selection, and container connection
lifetime. [Streaming](streaming.md) uses the prepared connection to control the
engine and exchange simulation state.

## Startup and Selection

Startup activation adds `atlas-engine-backend` to the status bar. The first-use
mode is TBB. A successful selection is persisted in extension global state and
restored on the next startup, including a previously selected CUDA mode.

Click the status bar item or run **Atlas Engine: Select Backend**:

- **TBB:** runs on CPU without an NVIDIA GPU. A missing image is downloaded.
- **CUDA:** checks GPU and container access before offering installation. If the
  CUDA image is absent, the user must accept the download prompt before pulling
  it. The replacement is used only after its native CUDA probe succeeds.

While preparing a replacement, cancellation or preparation/verification failure
keeps the existing connection. Failed CUDA selection does not silently switch the
saved mode or install system drivers. Inspect the `atlas-engine-backend` Output
channel for progress and errors. Select a backend again after disconnection.

Activation and connection are separate: an activation log can appear while image
preparation or connection verification is still running.

## Environment and Images

The host needs Docker CLI access to a Linux x86-64 Docker server. CUDA also needs
NVIDIA drivers and configured container GPU access on that server. With a remote
Docker context, checks apply to the server's GPU rather than the local machine.

The transport configures these image references:

```text
ghcr.io/wontae-lee/atlas-engine-dev:tbb-ubuntu22.04
ghcr.io/wontae-lee/atlas-engine-dev:cuda-ubuntu22.04
```

Image preparation checks local Docker image presence. It does not pull an already
installed image on every startup. Tags are not immutable version pins.

GPU preflight uses the TBB image with `--gpus all`, before downloading the optional
CUDA image. The current implementation checks for compute capability 7.5 or newer.
Its installation prompt estimates approximately 2.5 GB; this is not a measured
size for every future image. The final native probe determines whether the
selected image actually works with the server's driver/runtime setup.

## Check a Connection

Run **Atlas Engine: Check Backend**. Its `info` request checks Atlas import, a
native math operation, and device-memory initialization/readback, and logs the
result and engine version. It does not create or advance a simulation.

If disconnected, Backend first connects using the selected mode. Selection and
verification operations are serialized. Cancelling an in-progress check closes
the connection executing that request, so reconnect before using it again.

## Code and Communication

| File under `src/atlas/` | Responsibility |
| --- | --- |
| `backend/backend.ts` | Selection state, operation serialization, verified replacement, persistence, and shutdown |
| `backend/docker_backend.ts` | Image inspection/pull, GPU preflight, connection creation |
| `backend/backend_types.ts` | Modes, image references, transport and connection contracts |
| `detail/backend_setup.ts` | Preparation order: TBB availability, GPU check, consent, CUDA image pull |
| `detail/backend_ui.ts` | Status bar, prompts, cancellable progress, and Output |
| `detail/container_connection.ts` | Docker process lifetime, handshake, request forwarding, and cleanup |
| `detail/request_channel.ts` | JSON lines, request IDs, pending responses, cancellation, and timeouts |
| `detail/docker_error.ts` | Docker failure details including stderr |
| `detail/private_helpers.ts` | Shared execution, error, cancellation, and cleanup helpers |
| `streaming/runtime_source.ts` | Lazy loading and assembly of the container's Python runtime |

`Backend.connect()` prepares the image through BackendSetup, then verifies a
candidate connection before replacing the current connection and saving the mode.
BackendSetup uses the transport for Docker operations and BackendUi for consent
and progress. System and commands interact with Backend rather than these internal
implementation classes.

`get_connection()` returns the prepared connection. `on_connection()` announces
replacement and closure, with the original error for unexpected termination.
Streaming uses these notifications to invalidate its session.

```text
Backend → DockerBackend → ContainerConnection → RequestChannel
                                                    ↕ JSON lines
                                           Python EngineServer
                                             ├── info probe
                                             └── EngineSession
```

Requests carry a numeric ID, method, and optional parameters. Responses carry the
same ID and either a result or error. Simulation method names and data are owned
by Streaming. The protocol exposes no arbitrary Python execution endpoint.

The old `detail/bridge.ts` has been removed. The container receives the Python
runtime from `streaming/runtime/`, copied to `dist/runtime/` by the build. Runtime
files are read when opening a connection, not during manifest extraction. Protocol
stdout and native/log output are separated to avoid corrupting JSON responses.

Each owned container has a unique name, disabled networking, and no host-folder
mount. Replacement, cancellation, and disposal remove only owned containers.
Forced termination or an unavailable Docker server can prevent cleanup. Images
remain cached for reuse.

## Validation Status

The following are historical records from the original bridge integration, not
validation of the current Streaming runtime or subsequent refactors:

- TBB image download and an example with 8 cells, 200 particles, and 20 steps
  succeeded, including a request through the original JSON bridge.
- The then-current `npm test` suite passed 13 tests.
- Docker GPU preflight on an RTX 4070 failed because of NVIDIA runtime/CDI setup.
  No CUDA image was downloaded and actual CUDA execution was not verified.

The current runtime replacement has not had builds, tests, Docker, or simulations
executed. Test doubles validate different contracts from a real engine run; see
[Development workflow](development.md#checks-and-tests).
