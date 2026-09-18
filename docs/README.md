# Development Documentation

Use [AGENTS.md](../AGENTS.md) as the repository's development map and essential
working rules. These documents describe the current source implementation;
examples are not additional feature requirements.

| Task | Document |
| --- | --- |
| Launch, debug, reload, and test from CLion | [Development workflow](development.md) |
| Understand component ownership and source layout | [Extension architecture](vscode.md) |
| Add views, commands, and panels; generate package.json | [Manifest generation](manifest.md) |
| Select TBB/CUDA and maintain Docker connections | [Backend](backend.md) |
| Initialize and control simulations; receive results | [Streaming](streaming.md) |
| Follow naming, class, helper, and comment rules | [Coding style](guidelines/coding-style.md) |
| Review implemented changes | [Changelog](CHANGELOG.md) |

Start with the development workflow, then read the architecture and the document
for the component you are changing. Keep implementation details in the relevant
component document instead of repeating them throughout the documentation.

Commands document procedures developers can run. Agents must have an explicit
request before running builds, tests, benchmarks, simulations, generators, or
formatters. Test source and historical results are not proof that current changes
have passed validation.
