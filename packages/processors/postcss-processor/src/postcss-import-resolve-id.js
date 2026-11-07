/**
 * Re-exports the id resolver postcss-import uses by default, which ships without types.
 *
 * @remarks
 * Imported statically so a bundled copy keeps it. The sibling `.d.ts` types this module.
 */
export { default } from 'postcss-import/lib/resolve-id.js';
