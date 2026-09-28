/**
 * Fixed ports for non-cross-integration Playwright fixtures.
 *
 * Kept in the 431xx range so they do not collide with the cross-integration matrix
 * (4007–4022). Capability fixture ports are declared in each `fixture.e2e.ts`.
 */
export const reactPlaygroundE2ePort = 43101;
