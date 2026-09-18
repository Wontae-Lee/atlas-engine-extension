# AGENTS.md — Atlas Engine Extension

These instructions apply to this repository. Read
[coding-style.md](docs/guidelines/coding-style.md) before changing code.

This file records working rules. It does not prescribe a directory layout,
module hierarchy, or architecture. Structures shown in other documents are
examples unless the user explicitly asks to adopt them.

## Working Rules

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
  write them in English and follow the linked coding style.
- Keep documentation accurate when an intentional change affects the behavior
  it describes. Keep user-facing usage separate from contributor instructions.
- Do not carry over C++ engine rules for backends, bindings, generated headers,
  or module layout into this extension.
