# Coding Style

These rules describe how to write and change code in Atlas Engine Extension.
For source layout and component ownership, see
[Extension architecture](vscode.md) and [Interactive](interactive.md).

## 1. Scope and Readability

- Implement only the requested behavior. Do not add capabilities that were not
  asked for.
- Keep code concise and direct. Avoid unnecessary temporary variables and
  redundant branches.
- Keep the flow understandable where the code is used.
- Define one class per file, including test helper classes. Name class files
  after their class using snake_case, for example DockerBackend in docker_backend.ts.
- Shared interfaces, type aliases, constants, and functions may use separate
  snake_case files; they do not need artificial wrapper classes.
- Do not split work into many tiny helpers merely to shorten functions.
- Extract a helper or type when it has a substantial, clearly named
  responsibility.
- Put code under the layer that owns it: `app`, `backend`, `engine`, `project`,
  or `ui`. Keep stateful implementations separate classes, one per file.
- Follow nearby code conventions where applicable, without importing an
  unrelated module structure.

## 2. Naming

- Use snake_case for filenames, class member variables, and member functions, including constructor
  parameter properties and project-owned accessor properties.
- Preserve names required by external interfaces and wire protocols, such as
  VS Code's onDidChangeTreeData, getTreeItem, and getChildren. This rule does not rename classes,
  public command IDs, or local variables.
- Prefer concise, meaningful names. Readable flow matters more than raw name
  length.
- Avoid repeating context already supplied by the containing type or module.
- Give distinct steps distinct names. Avoid near-duplicate names that differ
  only by a generic suffix or repeated verb.
- Use a count suffix for quantities, such as project_count for a member variable.
  Avoid numberOfProject or numOfProject variants.
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
- Keep Project state and engine validation independent of tree field definitions.
- Keep manifest configuration free of live VS Code calls, runtime file reads,
  processes, and network operations. Start runtime services during activation.
- Browser Webview code must not import Node.js or the live VS Code module. Use
  the validated message boundary to request host operations.

## 5. Comments

Do not add comments unless requested. When comments are requested or an existing
comment needs to be updated:

- Write comments in English unless the user requests another language.
- Keep code identifiers, API names, and file paths in their original form
  within explanations.
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
