/**
 * Fixed ports for non–kitchen-sink Playwright fixtures.
 *
 * Kept in the 431xx range so they do not collide with the kitchen-sink matrix
 * (4007–4022) defined in `kitchen-sink.ts`.
 */
export const coreE2ePort = 43102;
export const corePostcssE2ePort = 43108;
export const reactPlaygroundE2ePort = 43101;
