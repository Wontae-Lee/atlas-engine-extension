# Coding Style

These rules describe how to write and change code in Atlas Engine Extension.
They do not require an architecture, directory layout, or file-splitting pattern.

## 1. Scope and Readability

- Implement only the requested behavior. Do not add capabilities that were not
  asked for.
- Keep code concise and direct. Avoid unnecessary temporary variables and
  redundant branches.
- Keep the flow understandable where the code is used.
- Do not split work into many tiny helpers merely to shorten functions.
- Extract a helper or type when it has a substantial, clearly named
  responsibility.
- Follow nearby code conventions where applicable, without importing an
  unrelated module structure.

## 2. Naming

- Prefer concise, meaningful names. Readable flow matters more than raw name
  length.
- Avoid repeating context already supplied by the containing type or module.
- Give distinct steps distinct names. Avoid near-duplicate names that differ
  only by a generic suffix or repeated verb.
- Use a count suffix for quantities, following the surrounding naming
  convention, such as `projectCount` in camelCase or `project_count` in
  snake_case. Avoid `numberOfProject` or `numOfProject` variants.
- Use established domain acronyms when they are already familiar in the code.
  Do not expand them into unnecessarily long names.
- Treat public renames as breaking changes. Do not rename public APIs or
  identifiers unless explicitly requested.

## 3. Control Flow and Error Handling

- Do not add defensive checks, fallback paths, ownership guards, recovery
  branches, or diagnostic-only state unless requested or needed to preserve
  an existing contract.
- Do not silently repair invalid states by resetting, zeroing, clamping,
  skipping required work, or mutating unrelated data unless that behavior is
  part of the request.
- Make the requested behavior and its failure paths understandable.

## 4. State and Ownership

- A guard branch changes only the state owned by its own operation.
- Do not mutate unrelated shared state as a side effect of handling a local
  condition.
- Preserve existing behavior and ownership unless the task requires a change.
- Avoid unrelated performance or data-layout changes.

## 5. Comments

Do not add comments unless requested. When comments are requested or an existing
comment needs to be updated:

- Write comments in English.
- Use `/** ... */` for multi-line documentation and `//` for notes inside a
  function.
- Explain what the signature or code cannot show, rather than restating names
  or operations.
- Describe relevant constraints, units, valid ranges, ownership, lifetimes,
  return values, and failure behavior.
- Explain why a surprising implementation is necessary.
- Document deliberate simplifications so they are not mistaken for accidental
  omissions.
- Keep comments accurate when the described behavior changes.

## 6. Instrumentation

- Keep temporary logging, counters, assertions, probes, timing code, and
  instrumentation-only fields out of production code unless requested.
- Do not leave debugging scaffolding behind after completing a change.

## 7. Validation

- Do not run builds, tests, benchmarks, simulations, generators, or formatters
  unless the user explicitly asks.
- Report what was actually checked. Do not claim a check passed when it was not
  run.
