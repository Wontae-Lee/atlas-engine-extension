# Development Documentation

For first launch and everyday use, start with the [user guide](../README.md).
[AGENTS.md](../AGENTS.md) is the development map and essential working rules.

| Task | Document |
| --- | --- |
| Launch, reload, debug from CLion, and choose validation commands | [Development workflow](development.md) |
| Understand System, component ownership, UI regions, persistence, and catalog data | [Extension architecture](vscode.md) |
| Register a sidebar or editor view, add a command, and generate metadata | [Manifest generation](manifest.md) |
| Select TBB/CUDA and maintain Docker connections | [Backend](backend.md) |
| Build engine configurations, control sessions, and receive/export results | [Streaming](streaming.md) |
| Follow naming, class, helper, and comment rules | [Coding style](coding-style.md) |
| Resume planned visualization performance work | [Performance plan](plan.md) |
| Review implemented changes | [Changelog](CHANGELOG.md) |

The current UI separates responsibilities: the central Simulation Webview owns
execution controls; the left sidebar owns case editing and output; the right
sidebar owns status and statistics; the bottom panel records simulation events.
There is no separate Results editor.

These documents describe source behavior, not independent runtime verification.
Commands are procedures for developers to run. Agents still need an explicit
request before executing builds, tests, benchmarks, simulations, generators, or
formatters. See [validation guidance](development.md#checks-and-tests).
