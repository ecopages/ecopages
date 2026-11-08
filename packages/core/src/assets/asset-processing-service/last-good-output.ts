import type { EcoPagesAppConfig } from '../../config/internal-types.ts';
import { appLogger } from '../../global/app-logger.ts';
import { isDevelopmentRuntime } from '../../utils/runtime.ts';
import { requireAppRuntime } from '../../utils/app-runtime.ts';
import type { AssetKind } from './assets.types.ts';

/**
 * Whether an asset that fails to process keeps serving its last good output instead of failing the request.
 *
 * @remarks
 * The one place that decides it, for stylesheets and scripts alike. `ecopages dev` keeps serving so the error overlay
 * can show the failure and the next good save recovers it. A build, including the static generation of a build that
 * runs with a development `NODE_ENV`, and `ecopages start` do not: they fail loudly, or keep their own production rule
 * for a request-time rebuild (see `AssetProcessingService`).
 */
export function keepsLastGoodOutput(appConfig: EcoPagesAppConfig): boolean {
	return isDevelopmentRuntime() && !requireAppRuntime(appConfig).staticGenerationActive;
}

/**
 * Shows an asset failure in the browser overlay of every connected page, and of one that connects later.
 *
 * @remarks
 * The message names the asset, so a failure of a script or stylesheet no page imports directly is still traceable.
 */
export function showAssetFailure(appConfig: EcoPagesAppConfig, kind: AssetKind, source: string, error: unknown): void {
	appConfig.appRuntime?.hmr?.reportBuildError(source, describeAssetFailure(kind, source, error));
}

/** Logs an asset failure and shows it in the overlay (see {@link showAssetFailure}). */
export function reportAssetFailure(
	appConfig: EcoPagesAppConfig,
	kind: AssetKind,
	source: string,
	error: unknown,
): void {
	appLogger.error(describeAssetFailure(kind, source, error));
	showAssetFailure(appConfig, kind, source, error);
}

function describeAssetFailure(kind: AssetKind, source: string, error: unknown): string {
	return `Failed to process ${kind} ${source}: ${error instanceof Error ? error.message : String(error)}`;
}
