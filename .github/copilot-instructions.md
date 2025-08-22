# Copilot Coding Rules

## Commenting

- Avoid inline comments (`// ...`).
- Use JSDoc comments (`/** ... */`) only when necessary, especially for public APIs, complex logic, or exported functions/classes.
- Do not over-comment; prefer clear, self-explanatory code.

## Formatting

- Do not worry about style or formatting issues (e.g., Prettier, linter warnings).
- Auto-format on save will handle these.
- Template literals are preferred over string concatenation.
- Do not use emoji, symbols, or other non-standard characters. Instead you can use plain text (i.e. `[what-emoji-represent]`)

## TypeScript

- Avoid TypeScript hacks and anti-patterns.
- Do not use `any` unless absolutely necessary.
  - If you must use `any`, add a comment explaining why.
- Prefer `unknown` over `any` when possible.

## JS Runtime

- Please remember we are using bun js
