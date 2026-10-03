# Browser tests

Prefer a real browser (for example Vitest browser mode) where the project runs one; a simulated DOM has no layout and no real navigation.

- Drive interaction like a user, not with hand-dispatched events. In a real browser, the runner's own `userEvent` sends real input (in Vitest browser mode, from `vitest/browser`); in a simulated DOM, use `@testing-library/user-event`. Match what the package's tests already use.
- Assert what a user or assistive technology sees: role, `aria-*` state, text, URL, focus.
- Wait with `vi.waitFor` or `findBy*` around one assertion, with no side effects inside.
- Without test globals, Testing Library does not clean up on its own. Call `cleanup()` in `afterEach` when you `render`, and reset `document.body` when you mount by hand.
- Use only the matchers the project has installed. Check for `@testing-library/jest-dom` before using `toBeInTheDocument()`; without it, use plain matchers such as `toBeNull()`.
