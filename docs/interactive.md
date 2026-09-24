# Atlas Interactive Integration

The extension uses the native JSONL contract documented in the [engine submodule](../external/atlas-engine/docs/frontends/interactive.md). A request contains `request_id`, `command`, optional `session_id`, and optional `payload`. The response echoes `request_id` and has `success`; request failures include `error`. `JsonlChannel` owns framing and correlation. `AtlasClient` owns the command vocabulary.

`validate(target, config)` is stateless. `create(config, output)` returns a new session ID. `start`, `pause`, `step`, `status`, `restart`, `save`, `close`, `render_open`, and `render_close` act on that ID. Applying new settings validates and writes `atlas.simulation.json`, creates a new session, switches the active ID, and then closes the old session. A failed create leaves the old session intact.

Running is native inside Atlas Interactive. The extension polls `status` for a compact step/state display; it does not schedule simulation steps or request particle snapshots. `render_open` uses the same process and session. Only the native window renders live particles. `save` writes Core binary state under `state/time_step_*/`, and native CSV output goes under `output/` when enabled.

The current engine has no restore/load command or headless frame streaming. The Webview condition drawing is based on project data and is independent of the native renderer.
