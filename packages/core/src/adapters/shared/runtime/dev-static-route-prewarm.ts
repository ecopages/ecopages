import { appLogger } from '../../../global/app-logger.ts';

export type DevStaticRoutePrewarmOptions = {
	pathnames: readonly string[];
	renderPath: (pathname: string) => Promise<void>;
	signal?: AbortSignal;
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

async function runWithConcurrency<T>(
	items: readonly T[],
	concurrency: number,
	worker: (item: T) => Promise<void>,
	signal?: AbortSignal,
) {
	if (items.length === 0) {
		return;
	}

	let index = 0;
	const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
		while (index < items.length && !signal?.aborted) {
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
 * Renders declared pathnames through the response pipeline.
 *
 * @remarks
 * That can warm the module graph and, when the page cache is enabled, the ordinary page cache.
 * Prewarm does not keep a separate HTML cache.
 */
export async function runDevStaticRoutePrewarm(options: DevStaticRoutePrewarmOptions): Promise<void> {
	const pathnames = [...new Set(options.pathnames)];
	if (pathnames.length === 0) {
		return;
	}

	options.onPathnamesResolved?.(pathnames);

	const concurrency = resolvePrewarmConcurrency();
	appLogger.debug(`${LOG_PREFIX} started (${pathnames.length} path(s), concurrency ${concurrency})`);
	appLogger.debug(`${LOG_PREFIX} pathnames: ${pathnames.join(', ')}`);

	await runWithConcurrency(
		pathnames,
		concurrency,
		async (pathname) => {
			try {
				await options.renderPath(pathname);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				appLogger.debug(`${LOG_PREFIX} skipped ${pathname}: ${message}`);
			}
		},
		options.signal,
	);

	appLogger.debug(`${LOG_PREFIX} finished (${pathnames.length} path(s))`);
}

/**
 * Collects and renders prewarm paths in the background, logging failures for shutdown to await.
 */
export function startDevStaticRoutePrewarm(
	options: Omit<DevStaticRoutePrewarmOptions, 'pathnames'> & {
		collectPathnames: () => Promise<readonly string[]> | readonly string[];
	},
): Promise<void> {
	return collectDevStaticRoutePrewarmPaths(options)
		.then((pathnames) => {
			if (pathnames === undefined || options.signal?.aborted) {
				return;
			}

			return runDevStaticRoutePrewarm({ ...options, pathnames });
		})
		.catch((error: unknown) => {
			appLogger.error(`${LOG_PREFIX} failed`, error instanceof Error ? error : new Error(String(error)));
		});
}

function collectDevStaticRoutePrewarmPaths(
	options: Pick<DevStaticRoutePrewarmOptions, 'signal'> & {
		collectPathnames: () => Promise<readonly string[]> | readonly string[];
	},
): Promise<readonly string[] | undefined> {
	return new Promise((resolve, reject) => {
		const { signal } = options;
		if (signal?.aborted) {
			resolve(undefined);
			return;
		}

		let settled = false;
		let startCollection: ReturnType<typeof setTimeout> | undefined;
		const finish = (complete: () => void) => {
			if (settled) {
				return;
			}

			settled = true;
			if (startCollection !== undefined) {
				clearTimeout(startCollection);
			}
			signal?.removeEventListener('abort', onAbort);
			complete();
		};
		const onAbort = () => finish(() => resolve(undefined));

		signal?.addEventListener('abort', onAbort, { once: true });
		if (signal?.aborted) {
			onAbort();
			return;
		}

		startCollection = setTimeout(() => {
			void Promise.resolve()
				.then(options.collectPathnames)
				.then(
					(pathnames) => finish(() => resolve(pathnames)),
					(error: unknown) => finish(() => reject(error)),
				);
		}, 0);
	});
}
