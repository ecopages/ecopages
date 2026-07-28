import { appLogger } from '../../../global/app-logger.ts';

export type DevPrewarmReadiness = 'background' | 'beforeReady';

export type DevStaticRoutePrewarmOptions = {
	pathnames: readonly string[];
	readiness?: DevPrewarmReadiness;
	renderPath: (pathname: string) => Promise<void>;
	/** Invoked with the pathname list before rendering begins. */
	onPathnamesResolved?: (pathnames: readonly string[]) => void;
};

const LOG_PREFIX = '[ecopages:dev-prewarm]';

function resolvePrewarmConcurrency(): number {
	const fromEnv = process.env.ECOPAGES_DEV_PREWARM_STATIC_ROUTES_PARALLELISM;
	if (fromEnv) {
		const parsed = Number(fromEnv);
		if (Number.isFinite(parsed) && parsed > 0) {
			return Math.floor(parsed);
		}
	}

	return 3;
}

async function runWithConcurrency<T>(items: readonly T[], concurrency: number, worker: (item: T) => Promise<void>) {
	if (items.length === 0) {
		return;
	}

	let index = 0;
	const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
		while (index < items.length) {
			const current = items[index];
			index += 1;
			if (current === undefined) {
				continue;
			}
			await worker(current);
		}
	});

	await Promise.all(runners);
}

/**
 * Renders declared pathnames so first client navigations hit warm graphs and scoped watch HTML cache.
 */
export async function runDevStaticRoutePrewarm(options: DevStaticRoutePrewarmOptions): Promise<void> {
	const pathnames = [...new Set(options.pathnames)];
	if (pathnames.length === 0) {
		return;
	}

	options.onPathnamesResolved?.(pathnames);

	const concurrency = resolvePrewarmConcurrency();
	const readiness = options.readiness ?? 'background';
	appLogger.debug(
		`${LOG_PREFIX} started (${pathnames.length} path(s), concurrency ${concurrency}, readiness=${readiness})`,
	);
	appLogger.debug(`${LOG_PREFIX} pathnames: ${pathnames.join(', ')}`);

	await runWithConcurrency(pathnames, concurrency, async (pathname) => {
		try {
			await options.renderPath(pathname);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			if (readiness === 'beforeReady') {
				appLogger.warn(`${LOG_PREFIX} skipped ${pathname}: ${message}`);
			} else {
				appLogger.debug(`${LOG_PREFIX} skipped ${pathname}: ${message}`);
			}
		}
	});

	appLogger.debug(`${LOG_PREFIX} finished (${pathnames.length} path(s))`);
}

/**
 * Fire-and-forget wrapper around {@link runDevStaticRoutePrewarm}.
 */
export function startDevStaticRoutePrewarm(options: DevStaticRoutePrewarmOptions): void {
	void runDevStaticRoutePrewarm(options).catch((error) => {
		appLogger.error(`${LOG_PREFIX} failed: ${error instanceof Error ? error.message : String(error)}`);
	});
}
