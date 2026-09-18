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
  -> Scene samples at most 20,000 particles
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
- `views/center/scene.ts`: sampling happens after the full snapshot reaches the
  extension, so it does not reduce engine-to-extension transfer.
- `views/center/webview/scene_renderer.ts`: CPU projection, per-frame allocation,
  depth sorting, and per-particle Canvas drawing.

These are bottleneck candidates from source inspection, not measured rankings.
The scheduling alone limits updates to below 10 per second once computation and
transport time are included. Increasing particles adds serialization, transfer,
validation, statistics, and rendering work.

The inspected local sibling repository, `../atlas-engine-dev`, has:

- `include/atlas/observer/observer.h`: a periodic CSV writer that copies device
  buffers to host; it is not a shared-memory live visualization observer.
- `include/atlas/serialization/protobuf_snapshot.h`: binary snapshot save/restore
  APIs. The extension currently does not use these APIs.

Recheck the engine revision, Python bindings, and actual Docker image before
implementation. Local headers do not establish the capabilities of a cached
image. Determine which reads copy data, synchronize CUDA, or expose a view.

## Intended design

Separate simulation advancement, presentation frames, statistics, and full data
exports. Keep the current UI ownership: central Simulation controls execution,
right sidebar displays statistics, left OUTPUT exports data, and Backend manages
containers. Streaming remains the engine-control middleware.

1. Advance the engine independently of browser rendering and full snapshot
   delivery. Use bounded batches or an engine-side execution loop with safe
   control points. Define Pause acknowledgement and Step semantics explicitly;
   an execution loop must not prevent handling Pause, Reset, or Close.
2. Produce a bounded visualization frame in the engine process, sampling before
   serialization and preferably before unnecessary device-to-host copying.
   Send only display positions, species/color identifiers, step/time, true
   particle count, and required scene metadata. Keep all fields from one coherent
   simulation state.
3. Compute aggregate statistics near the engine data and send them at a separate,
   lower rate. Request full particle snapshots only when needed, such as explicit
   CSV export. Capture one consistent step for each export.
4. Use framed binary particle buffers instead of Python lists and JSON numbers.
   Evaluate Protobuf against typed packed arrays using actual payload/copy costs;
   changing serialization alone will not remove the current scheduling bottleneck.
   Small control messages can remain JSON. Specify protocol version, framing,
   numeric types, lengths, and session/frame IDs before changing transport.
5. Bound queues at every stage. Retain the latest display frame and discard
   superseded presentation frames without dropping simulation steps or control
   responses. Throttle or suspend preview delivery when hidden.
6. Render the latest available frame on the browser's display schedule, with
   reusable buffers. Measure Canvas cost before deciding whether WebGL point
   rendering is needed. Do not accumulate stale render jobs.

A native memory pointer cannot simply be passed to the Extension Host or Webview:
these are separate processes, and CUDA memory adds a separate access/synchronization
boundary. If shared memory or a new observer callback is considered, first define
buffer ownership, read/write synchronization, lifetime, transport across Docker,
and remote Docker behavior. Do not describe the design as zero-copy without
verifying every boundary, including Webview messaging.

## Implementation sequence

- [ ] Inspect current engine bindings, observer facilities, buffer access, and
      deployed image compatibility; identify any required engine-side changes.
- [ ] With explicit authorization, measure a baseline: native stepping, readback,
      list/JSON conversion, payload size, host decoding/statistics, browser transfer,
      render time, memory use, and end-to-end frame age.
- [ ] Define separate control, preview, statistics, and full-export contracts;
      include session invalidation and backpressure behavior.
- [ ] Decouple advancement from preview cadence while preserving deterministic
      manual Step, Pause completion, Reset, Apply, and backend replacement.
- [ ] Sample and aggregate in the runtime; migrate preview transfer to binary.
- [ ] Update the Webview to consume bounded latest frames and reuse buffers.
- [ ] Adapt right-side statistics/history and OUTPUT exports so they no longer
      require continuous full particle snapshots.
- [ ] Evaluate rendering changes only after measuring remaining bottlenecks.
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

- Preview cadence does not throttle simulation advancement, and slowing/hiding
  the browser does not create an unbounded queue or memory growth.
- Preview payload size is bounded by the display budget rather than total
  particles; statistics still describe all particles.
- Pause stops advancement at its documented safe point; manual Step advances the
  requested count. Reset/Apply/reconnection discard stale frames and statistics.
- Full CSV export retains all requested particles from one step, even while
  simulation execution continues.
- Binary framing handles partial reads, malformed lengths, cancellation, and
  connection loss without corrupting subsequent control messages.
- Particle values/species, aggregate statistics, and simulation results agree
  with the prior implementation for a controlled case within applicable numeric
  tolerances. Presentation sampling must not change the physical simulation.

Record throughput, frame rate/frame age, pause latency, payload bytes, CPU/memory,
and GPU readback costs where measurable. Choose performance targets after baseline
measurement; do not claim a speedup based only on type checks or source inspection.
