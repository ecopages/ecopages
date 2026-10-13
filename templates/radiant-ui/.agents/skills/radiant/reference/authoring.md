# Authoring

## Contents

- Rules
- Review checklist
- Output expectations

## Rules

1. **Prefer semantic decorators** — `@prop(...)` for public API, `@state` for internal mutable state. Reach for lower-level names only with a deliberate reason.
2. **Keep public props narrow** — do not leak internal state into the JSX contract unless that API is intentional.
3. **Reassign arrays and objects** — do not rely on in-place mutation to trigger updates.
4. **Keep event code plain** — ordinary methods or arrow functions; use the browser event object directly.
5. **Keep JSX intentional** — avoid extra wrapper components, memoization-style patterns without need, and assuming cached JSX nodes with plain props stay live automatically.
6. **Paint existing DOM with `@bindTo`** — sit it on a `@prop` / `@state` / `@signal` field. Do not `@query` + `@onUpdated` to copy a value into text, an attribute, or a DOM property. `@onUpdated` is for procedures (focus, timers, joined ARIA, derived state).
7. **Use slots deliberately** — literal `<slot>` tags and the Radiant projection model for HTML-first hosts. JSX libraries keep Authored Children in the parent tree.
8. **Document important APIs** — meaningful TSDoc for new public APIs or significant architecture. No noisy inline comments.
9. **Keep docs examples minimal** — smallest number of hosts that still demonstrates the target API. A second custom element only when provider/consumer boundaries or leaf ownership is the lesson.

## Review checklist

1. Should this be `RadiantElement` or `RadiantController`?
2. Are public props separated from internal bindings when they should be?
3. Are plain reads used for control flow and class/style composition?
4. Are JSX bindings used for leaves in `render()`, and `@bindTo` for the same writes on existing DOM?
5. Is any `Bindings` generic present only from habit rather than actual usage?
6. Does any `@query` exist only so a callback can copy a field into the node?
7. If render reads `provider.getContext()`, what causes the host to rerender when that context changes?
8. Are object or array updates using reassignment instead of mutation?
9. If this is docs or example code, does it teach the Radiant model clearly?

## Output expectations

Code:

- one host class per file
- exported component classes
- explicit public props types when JSX consumers need them
- internal bindings types only when the code uses binding APIs
- minimal examples that teach one intended model

Docs and explanations: what works, and why one choice is better in Radiant specifically.
