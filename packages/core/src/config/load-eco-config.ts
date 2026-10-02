import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { EcoPagesAppConfig } from '../types/internal-types.ts';
import { finalizeEcoPagesConfig } from './finalize-config.ts';
import { resolveEcoConfigPath } from './resolve-eco-config-path.ts';
import type { EcoPagesUserConfig, LoadEcoPagesConfigOptions, LoadedEcoPagesUserConfig } from './user-config-types.ts';

const moduleLoadCache = new Map<string, Promise<EcoPagesUserConfig>>();
const appConfigCache = new Map<string, Promise<EcoPagesAppConfig>>();

function resolveLoaderCwd(cwd?: string): string {
	return path.resolve(cwd ?? process.cwd());
}

function createCacheKey(configFilePath: string, buildOwnership: string, cwd: string): string {
	return `${configFilePath}::${buildOwnership}::${cwd}`;
}

async function importEcoConfigModule(configFilePath: string): Promise<unknown> {
	const moduleUrl = pathToFileURL(configFilePath).href;
	const configModule = await import(moduleUrl);
	return configModule.default ?? configModule;
}

function loadConfigModule(configFilePath: string): Promise<EcoPagesUserConfig> {
	const cached = moduleLoadCache.get(configFilePath);
	if (cached) {
		return cached;
	}

	const loadPromise = (async (): Promise<EcoPagesUserConfig> => {
		const exported = await importEcoConfigModule(configFilePath);
		if (!exported || typeof exported !== 'object') {
			throw new Error(
				`Ecopages config at ${configFilePath} must default-export an object from defineConfig(...).`,
			);
		}

		const userConfig = exported as EcoPagesUserConfig;
		if (
			userConfig.rootDir !== undefined &&
			(typeof userConfig.rootDir !== 'string' || userConfig.rootDir.length === 0)
		) {
			throw new Error(
				`Ecopages config at ${configFilePath} must set rootDir to a non-empty string when provided.`,
			);
		}

		return userConfig;
	})();

	moduleLoadCache.set(configFilePath, loadPromise);

	return loadPromise.catch((error) => {
		moduleLoadCache.delete(configFilePath);
		throw error;
	});
}

/**
 * Loads the user-owned config object from the resolved config module.
 */
export async function loadEcoPagesUserConfig(
	options: LoadEcoPagesConfigOptions = {},
): Promise<LoadedEcoPagesUserConfig> {
	const cwd = resolveLoaderCwd(options.cwd);
	const configFilePath = resolveEcoConfigPath({ ...options, cwd });
	return {
		config: await loadConfigModule(configFilePath),
		configFilePath,
	};
}

/**
 * Loads and finalizes the Ecopages config for the current project.
 *
 * @remarks
 * Coalesces concurrent loads and caches by `configFilePath`, `buildOwnership`, and `cwd`.
 */
export async function loadEcoPagesConfig(options: LoadEcoPagesConfigOptions = {}): Promise<EcoPagesAppConfig> {
	const cwd = resolveLoaderCwd(options.cwd);
	const configFilePath = resolveEcoConfigPath({ ...options, cwd });
	const buildOwnership = options.buildOwnership ?? 'rolldown';
	const cacheKey = createCacheKey(configFilePath, buildOwnership, cwd);

	const cached = appConfigCache.get(cacheKey);
	if (cached) {
		return cached;
	}

	const loadPromise = (async (): Promise<EcoPagesAppConfig> => {
		return await finalizeEcoPagesConfig(await loadConfigModule(configFilePath), {
			configFilePath,
			buildOwnership: options.buildOwnership,
			cwd,
		});
	})();

	appConfigCache.set(cacheKey, loadPromise);

	return loadPromise.catch((error) => {
		appConfigCache.delete(cacheKey);
		throw error;
	});
}

/** @internal */
export function clearEcoPagesConfigCachesForTests(): void {
	moduleLoadCache.clear();
	appConfigCache.clear();
}
