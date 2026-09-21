# Simulation Visualization Performance Plan

Status: planned, not implemented. Recorded on 2026-09-18 after the user reported
stuttering. This task records the follow-up work only; no runtime measurements,
benchmarks, or performance changes have been made.

## Current implementation and evidence

The visualization uses full JSON snapshots, not Protobuf or shared engine memory.
The source path is:

```text
Streaming requests one step
  -> EngineSession advances the native System
  -> reads all positions, velocities, and species
  -> NumPy arrays become Python lists
  -> EngineServer serializes a JSON response over Docker stdio
  -> RequestChannel parses JSON in the Extension Host
  -> Scene forwards every particle to the Webview
  -> Webview projects, depth-sorts, and draws with Canvas 2D
  -> Streaming waits 100 ms after completion before requesting the next step
```

Relevant files under `src/atlas/`:

- `streaming/streaming.ts`: defaults to one step per request and a 100 ms delay
  after the response, coupling simulation throughput to snapshot round trips.
- `streaming/runtime/engine_session.py`: `_snapshot()` reads all three particle
  arrays and calls `tolist()` for every response.
- `streaming/runtime/engine_server.py` and `detail/request_channel.ts`: JSON
  serialization/parsing over the request/response channel.
- `views/center/scene.ts`: forwards the full particle positions and species arrays
  from each delivered snapshot to the Webview.
- `views/center/webview/scene_renderer.ts`: CPU projection, per-frame allocation,
  depth sorting, and per-particle Canvas drawing.

These are bottleneck candidates from source inspection, not measured rankings.
The scheduling alone limits updates to below 10 per second once computation and
transport time are included. Increasing particles adds serialization, transfer,
validation, statistics, and rendering work.

Future visualization work stays inside the extension and treats the engine and
its snapshot protocol as an unchanged external boundary. The extension is the
engine GUI: presentation changes must not alter simulation behavior, engine data,
or particle counts.

## Intended design

Keep the current UI ownership: central Simulation controls execution, right
sidebar displays statistics, left OUTPUT exports data, and Backend manages
containers. Streaming remains the engine-control middleware.

1. Preserve the engine request/response protocol and forward complete snapshots.
   Do not sample, aggregate, or otherwise change engine data for presentation.
2. Coalesce extension-to-Webview updates so only the latest complete snapshot is
   waiting to render. Dropping a superseded UI update must not drop an engine step
   or mutate the snapshot itself.
3. Avoid repeated copies and temporary objects in the Extension Host and Webview
   where the existing message boundary permits it. Keep positions and species
   aligned and from one coherent simulation state.
4. Render every received particle on the browser display schedule. Measure the
   existing Canvas path before deciding whether an extension-only WebGL renderer
   or reusable browser buffers are needed.
5. Throttle or suspend Webview delivery while the panel is hidden, then display
   the newest complete snapshot when it becomes visible.
6. Keep statistics and CSV exports based on the complete engine snapshot.

## Implementation sequence

- [ ] With explicit authorization, measure Extension Host processing, Webview
      transfer, render time, memory use, and end-to-end frame age.
- [ ] Confirm that hidden/slow Webviews retain only the latest complete UI update.
- [ ] Reduce extension-side allocations and copies without changing snapshot data.
- [ ] Evaluate Canvas and WebGL rendering with complete particle arrays.
- [ ] Keep statistics/history and OUTPUT exports on complete snapshots.
- [ ] Update architecture/streaming/user documentation to describe implemented
      behavior, and record actual validation separately from this plan.

Follow one class per file, snake_case filenames and project-owned members, shared
helpers in `detail/private_helpers.ts`, and existing System ownership. Avoid
introducing live runtime work into contribution constructors or manifest extraction.

## Validation for the implementation task

Run checks only when explicitly authorized under AGENTS.md. Compare the same
case, hardware/backend, particle counts, and settings before and after changes.
Include TBB and CUDA where available, and record unsupported environments.

Verify that:

- Slowing or hiding the browser does not create an unbounded queue or memory
  growth, and the newest complete snapshot appears when the view resumes.
- The preview receives and draws every position/species pair in the snapshot.
- Pause stops advancement at its documented safe point; manual Step advances the
  requested count. Reset/Apply/reconnection discard stale frames and statistics.
- Full CSV export retains all requested particles from one step, even while
  simulation execution continues.
- Particle values/species, aggregate statistics, and simulation results remain
  unchanged for a controlled case within applicable numeric tolerances.

Record throughput, frame rate/frame age, pause latency, Webview payload bytes, and
Extension Host/browser CPU and memory where measurable. Choose performance targets
after baseline measurement; do not claim a speedup based only on type checks or
source inspection.
