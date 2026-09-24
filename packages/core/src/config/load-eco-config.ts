import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { EcoPagesAppConfig } from '../types/internal-types.ts';
import { applyUserConfigToBuilder } from './apply-user-config.ts';
import { ConfigBuilder } from './config-builder.ts';
import { isFinalizedEcoPagesAppConfig } from './is-finalized-app-config.ts';
import { resolveEcoConfigPath } from './resolve-eco-config-path.ts';
import type {
	EcoPagesUserConfig,
	FinalizeEcoPagesConfigOptions,
	LoadEcoPagesConfigOptions,
	LoadedEcoPagesUserConfig,
} from './user-config-types.ts';

type LoadedConfigModule =
	| { kind: 'finalized'; appConfig: EcoPagesAppConfig; configFilePath: string }
	| { kind: 'user'; userConfig: EcoPagesUserConfig; configFilePath: string };

const moduleLoadCache = new Map<string, Promise<LoadedConfigModule>>();
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

function loadConfigModule(configFilePath: string): Promise<LoadedConfigModule> {
	const cached = moduleLoadCache.get(configFilePath);
	if (cached) {
		return cached;
	}

	const loadPromise = (async (): Promise<LoadedConfigModule> => {
		const exported = await importEcoConfigModule(configFilePath);
		if (isFinalizedEcoPagesAppConfig(exported)) {
			return { kind: 'finalized', appConfig: exported, configFilePath };
		}

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

		return { kind: 'user', userConfig, configFilePath };
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
	const loaded = await loadConfigModule(configFilePath);

	if (loaded.kind === 'finalized') {
		throw new Error(
			`Ecopages config at ${configFilePath} exported a finalized app config. Use defineConfig(...) and let createApp() finalize the config.`,
		);
	}

	return {
		config: loaded.userConfig,
		configFilePath,
	};
}

/**
 * Finalizes a loaded user config through {@link ConfigBuilder.build}.
 */
export async function finalizeEcoPagesConfig(
	loaded: LoadedEcoPagesUserConfig,
	options: FinalizeEcoPagesConfigOptions = {},
): Promise<EcoPagesAppConfig> {
	const buildOwnership = options.buildOwnership ?? loaded.config.buildOwnership ?? 'rolldown';
	const cwd = resolveLoaderCwd(options.cwd);
	const builder = new ConfigBuilder();
	applyUserConfigToBuilder(builder, loaded.config, { cwd });
	builder.setBuildOwnership(buildOwnership);
	builder.setConfigModulePath(loaded.configFilePath);
	return await builder.build();
}

/**
 * Loads and finalizes the Ecopages config for the current project.
 *
 * @remarks
 * Coalesces concurrent loads and caches by `configFilePath`, `buildOwnership`, and `cwd`.
 * Files that still export a finalized {@link ConfigBuilder.build} result are returned as-is
 * so workers and tests can load existing `eco.config.ts` modules.
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
		const loaded = await loadConfigModule(configFilePath);
		if (loaded.kind === 'finalized') {
			return loaded.appConfig;
		}

		return await finalizeEcoPagesConfig(
			{ config: loaded.userConfig, configFilePath },
			{ buildOwnership: options.buildOwnership, cwd },
		);
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
