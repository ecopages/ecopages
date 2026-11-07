/** Shared attribute used to keep DOM elements across page navigations. */
export const ECO_PERSIST_ATTRIBUTE = 'data-eco-persist';

/**
 * Marks a head script as an Integration's global script, such as Lit's hydration support.
 *
 * @remarks
 * A client navigation loads the marked scripts of the next document before it imports that Page's modules or swaps
 * its markup, so a Component the Page imports finds the global hook it relies on already in place.
 */
export const ECO_GLOBAL_SCRIPT_ATTRIBUTE = 'data-eco-global-script';
