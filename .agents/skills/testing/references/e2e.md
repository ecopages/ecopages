# End-to-end tests (Playwright)

Add a spec only when the risk is the wired system. Never write an end-to-end test for a pure function or anything a unit test can see. Read the project's e2e docs first: how fixtures are registered, which projects exist, and how to run one.

- Run a single project (`playwright test --project <name>`, plus whatever the project's docs require) instead of the whole matrix.
- Never wait with `page.waitForTimeout`. Wait on the visible result.
- Use web-first assertions: `await expect(locator).toBeVisible()`, never `expect(await locator.isVisible())`.
- Absence passes before the page has rendered anything. Assert that the region rendered, then that the thing is absent.
- Await every Playwright call. A floating `expect` can pass without ever checking.
- A stress test must overlap its actions, such as navigations fired together. Pacing each step removes the stress.
- Use `test.describe.configure({ mode: 'serial' })` only when tests share server state, and say why.
