/**
 * Writes the typed `ecopages:content/*` declarations before `tsc` runs.
 *
 * @remarks
 * The content processor generates them into `node_modules/@types/ecopages-content-processor/`
 * when the config is finalized, which normally happens during `dev` or `build`. A fresh
 * checkout, such as CI, has neither, so `tsc` would fall back to untyped entries.
 *
 * @module
 */
import { loadEcoPagesConfig } from '@ecopages/core/config';

await loadEcoPagesConfig({ cwd: new URL('..', import.meta.url).pathname });
