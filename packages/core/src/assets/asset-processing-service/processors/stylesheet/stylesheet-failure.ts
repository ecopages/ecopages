import type { EcoPagesAppConfig } from '../../../../config/internal-types.ts';
import { appLogger } from '../../../../global/app-logger.ts';
import { isDevelopmentRuntime } from '../../../../utils/runtime.ts';
import { toClassMapModule, toStylesheetModule } from './stylesheet-module.ts';
import { requireAppRuntime } from '../../../../utils/app-runtime.ts';

/**
 * Whether a stylesheet that fails to process keeps serving its last good output instead of failing the request.
 *
 * @remarks
 * The one place that decides it. `ecopages dev` keeps serving so the error overlay can show the failure and the next
 * good save recovers it. A build, including the static generation of a build that runs with a development `NODE_ENV`,
 * and `ecopages start` do not: they fail loudly, or keep their own production rule for a request-time rebuild (see
 * `AssetProcessingService`).
 */
export function keepsLastGoodStylesheet(appConfig: EcoPagesAppConfig): boolean {
	return isDevelopmentRuntime() && !requireAppRuntime(appConfig).staticGenerationActive;
}

/**
 * Logs a stylesheet failure and shows it in the browser overlay of every connected page, and of one that connects
 * later.
 */
export function reportStylesheetFailure(appConfig: EcoPagesAppConfig, source: string, error: unknown): void {
	const message = error instanceof Error ? error.message : String(error);
	appLogger.error(`Failed to process stylesheet ${source}: ${message}`);
	appConfig.appRuntime?.hmr?.reportBuildError(source, message);
}

/** The module a binding import of a stylesheet that never compiled receives: an empty class map or an empty string. */
export function emptyStylesheetModule(isCssModule: boolean): string {
	return isCssModule ? toClassMapModule({}) : toStylesheetModule('');
}
