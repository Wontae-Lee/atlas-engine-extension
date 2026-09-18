# Atlas Engine Extension: Development Guide

Use this file as a map to the development documentation. Read the coding style
and the documents relevant to the requested change before editing code.

## Documentation Map

| Task | Documentation |
| --- | --- |
| Find project documentation | [Documentation index](docs/README.md) |
| Follow naming, class, helper, and comment conventions | [Coding style](docs/guidelines/coding-style.md) |
| Set up development, launch the extension, debug, or run checks | [Development workflow](docs/development.md) |
| Understand activation, System lifecycle, and source layout | [Extension architecture](docs/vscode.md) |
| Register views, commands, or panels and generate package.json | [Manifest generation](docs/manifest.md) |
| Work on Docker lifecycle, connections, or TBB/CUDA selection | [Backend](docs/backend.md) |
| Control the engine and exchange simulation state and results | [Streaming](docs/streaming.md) |
| Record implemented changes | [Changelog](docs/CHANGELOG.md) |

## Essential Development Rules

- Keep changes within the requested scope and preserve existing user changes.
- Follow the linked coding style. Keep detailed conventions and architecture in
  their respective documents rather than duplicating them here.
- Treat `package.json` as generated output; edit its sources as described in the
  manifest documentation.
- Do not run builds, tests, benchmarks, simulations, generators, or formatters
  unless explicitly requested. Commands in documentation do not authorize execution.
- When moving files or changing behavior, update affected imports, entry points,
  and documentation. Record implemented changes under Unreleased in the changelog.
- Report source inspection separately from executed checks. Do not present
  historical results as validation of current changes.
