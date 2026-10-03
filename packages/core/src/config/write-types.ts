/**
 * Entry that `ecopages types` runs: it loads `eco.config.ts`, so processors write the types
 * for their virtual modules (such as `ecopages:images` and `ecopages:content/*`), then exits.
 *
 * @remarks
 * Only the config is loaded; the app entry (`app.ts`) never runs. The explicit exit ends any
 * handles a processor opened while preparing its build contributions.
 *
 * @module
 */
import { appLogger } from '../global/app-logger.ts';
import { loadEcoPagesConfig } from './load-eco-config.ts';

await loadEcoPagesConfig();
appLogger.info('Wrote the generated types for the virtual modules in eco.config.ts.');
process.exit(0);
