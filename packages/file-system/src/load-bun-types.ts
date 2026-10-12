/**
 * Loads Bun's type augmentations into compilations of this package.
 *
 * @remarks
 * Callers typecheck this source with `types: ["node"]` and `target: ES2021`.
 * Those settings omit the `Bun` global and the `Error` cause parameter. Importing
 * `bun` is what supplies both, from this file's own `@types/bun` dependency.
 */
import type {} from 'bun';
