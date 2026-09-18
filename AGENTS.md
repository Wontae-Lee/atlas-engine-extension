# AGENTS.md — Atlas Engine Extension

These instructions apply to this repository. Read
[coding-style.md](docs/guidelines/coding-style.md) before changing code.

This file records working rules and the conventions selected for this project.
The current implementation is described in [docs/README.md](docs/README.md).
Example features in the documentation are not requirements to implement them.

## Working Rules

- Define one class per file, including test helper classes. Use snake_case
  filenames, class member variables, and member functions, including constructor parameter
  properties and project-owned accessor properties. Preserve member names
  required by external APIs and protocols.
- Respond in Korean unless the user requests another language.
- Implement only the requested behavior. Do not add unrelated capabilities,
  refactorings, or architectural changes.
- Preserve existing user changes and public behavior outside the requested scope.
- Do not run builds, tests, benchmarks, simulations, generators, or formatters
  unless the user explicitly asks.
- Do not rename public APIs or identifiers unless a rename is explicitly
  requested.
- Keep implementation concise and direct. Avoid abstractions that hide the
  flow without clarifying a substantial responsibility.
- Do not add comments unless requested. When writing or changing comments,
  write them in English unless the user requests another language, and follow
  the linked coding style.
- Keep documentation accurate when an intentional change affects the behavior
  it describes. Keep user-facing usage separate from contributor instructions.
- Do not carry over C++ engine rules for backends, bindings, generated headers,
  or module layout into this extension.

## Source and Helper Conventions

- Keep extension activation in `src/extension.ts`; project components live under
  `src/atlas/`. `System` owns registration, update order, and component disposal.
- Use `src/atlas/detail/` for internal implementations from any component, not
  only backend code. Keep substantial classes in their own snake_case files.
- Collect repeated internal helper functions in
  `src/atlas/detail/private_helpers.ts`. Do not create a second `helpers.ts` or
  a parallel `src/atlas/private_helpers.ts` for the same purpose.
- Keep stateful component behavior in its owning class. Do not move unrelated
  logic into the shared helper file merely to shorten a source file.
- When moving a file, update imports, tests, script entry points, and documentation
  references together.

## Manifest and Runtime

- Declare view, command, and panel instances in `src/atlas/contributions.ts`.
  Project metadata, dependencies, and npm scripts come from `config/*.jsonc`.
- Treat root `package.json` as generated output. Change its source declarations;
  regenerate it only when execution is authorized, and track the result in Git.
- Manifest extraction bundles and evaluates `src/atlas/contributions.ts` in
  ordinary Node.js. Its reachable top-level code, constructors, and field
  initializers must not call the live VS Code API or start external work.
- Use type-only VS Code imports in those components and accept the live API at
  runtime. Keep Docker connections and UI registration out of metadata creation.
- Preserve CUDA compatibility checks before installation consent and download,
  and verify a replacement connection before releasing the current connection.

## Documentation and Verification

- Keep contributor instructions in `docs/development.md`, architecture in
  `docs/vscode.md`, component registration in `docs/manifest.md`, and backend usage
  in `docs/backend.md`. Record implemented changes under Unreleased in the changelog.
- Documentation commands explain how a developer can run checks; they do not
  override the explicit-request rule for agents running builds or tests.
- Report source inspection separately from executed checks. Historical test
  results are not evidence that a later refactor has passed.
