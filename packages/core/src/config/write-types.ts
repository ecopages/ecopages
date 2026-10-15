/**
 * Entry that `ecopages types` runs: it loads `eco.config.ts` and sets the processors up, so they write the
 * types for their virtual modules (such as `ecopages:images` and `ecopages:content/*`), then exits.
 *
 * @remarks
 * Config finalization runs no processor code, so the types come from each processor's `setup()`, with
 * everything else it does there, such as optimizing images. The app entry (`app.ts`) never runs. The explicit
 * exit ends any handles a processor opened while setting up.
 *
 * @module
 */
import { setupAppRuntimePlugins } from '../build/build-adapter.ts';
import { appLogger } from '../global/app-logger.ts';
import { loadEcoPagesConfig } from './load-eco-config.ts';

const appConfig = await loadEcoPagesConfig();
await setupAppRuntimePlugins({ appConfig });
appLogger.info('Wrote the generated types for the virtual modules in eco.config.ts.');
process.exit(0);
