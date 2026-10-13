/**
 * Fixed ports for non-cross-integration Playwright fixtures.
 *
 * Kept in the 46xx range: below the range an operating system hands out to outgoing connections (Linux starts
 * at 32768), so a browser connection cannot already hold one when a fixture server binds it, and clear of the
 * cross-integration matrix (4007–4022). Capability fixture ports are declared in each `fixture.e2e.ts`.
 */
export const reactPlaygroundE2ePort = 4601;
