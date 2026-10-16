import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { EcoPagesAppConfig } from '../types/internal-types.ts';
import { finalizeEcoPagesConfig } from './finalize-config.ts';
import { resolveEcoConfigPath } from './resolve-eco-config-path.ts';
import type {
	EcoPagesUserConfig,
	EcoPagesUserConfigFactory,
	LoadEcoPagesConfigOptions,
	LoadedEcoPagesUserConfig,
} from './user-config-types.ts';

type EcoPagesConfigModuleExport = EcoPagesUserConfig | EcoPagesUserConfigFactory;

const moduleLoadCache = new Map<string, Promise<EcoPagesConfigModuleExport>>();

function resolveLoaderCwd(cwd?: string): string {
	return path.resolve(cwd ?? process.cwd());
}

async function importEcoConfigModule(configFilePath: string): Promise<unknown> {
	const moduleUrl = pathToFileURL(configFilePath).href;
	const configModule = await import(/* @vite-ignore */ moduleUrl);
	return configModule.default ?? configModule;
}

function loadConfigModule(configFilePath: string): Promise<EcoPagesConfigModuleExport> {
	const cached = moduleLoadCache.get(configFilePath);
	if (cached) {
		return cached;
	}

	const loadPromise = (async (): Promise<EcoPagesConfigModuleExport> => {
		const exported = await importEcoConfigModule(configFilePath);
		if (!exported || (typeof exported !== 'object' && typeof exported !== 'function')) {
			throw new Error(
				`Ecopages config at ${configFilePath} must default-export an object or a config factory from defineConfig(...).`,
			);
		}

		return exported as EcoPagesConfigModuleExport;
	})();

	moduleLoadCache.set(configFilePath, loadPromise);

	return loadPromise.catch((error) => {
		moduleLoadCache.delete(configFilePath);
		throw error;
	});
}

function materializeUserConfig(exported: EcoPagesConfigModuleExport, configFilePath: string): EcoPagesUserConfig {
	const userConfig = typeof exported === 'function' ? exported() : exported;
	if (!userConfig || typeof userConfig !== 'object' || Array.isArray(userConfig)) {
		throw new Error(
			`Ecopages config at ${configFilePath} must export a factory that returns a defineConfig(...) object.`,
		);
	}
	if (typeof Reflect.get(userConfig, 'then') === 'function') {
		throw new Error(`Ecopages config factory at ${configFilePath} must return its config synchronously.`);
	}
	if (
		userConfig.rootDir !== undefined &&
		(typeof userConfig.rootDir !== 'string' || userConfig.rootDir.length === 0)
	) {
		throw new Error(`Ecopages config at ${configFilePath} must set rootDir to a non-empty string when provided.`);
	}

	return userConfig;
}

/**
 * Loads the user-owned config object from the resolved config module.
 */
export async function loadEcoPagesUserConfig(
	options: LoadEcoPagesConfigOptions = {},
): Promise<LoadedEcoPagesUserConfig> {
	const cwd = resolveLoaderCwd(options.cwd);
	const configFilePath = resolveEcoConfigPath({ ...options, cwd });
	const exported = await loadConfigModule(configFilePath);
	return {
		config: materializeUserConfig(exported, configFilePath),
		configFilePath,
	};
}

/**
 * Loads and finalizes the Ecopages config for the current project.
 *
 * @remarks
 * Imports the config module once per resolved path, then finalizes a fresh app config and runtime
 * for every call. The module cache preserves the user's config-module identity; the finalized app
 * state belongs to each caller.
 */
export async function loadEcoPagesConfig(options: LoadEcoPagesConfigOptions = {}): Promise<EcoPagesAppConfig> {
	const cwd = resolveLoaderCwd(options.cwd);
	const configFilePath = resolveEcoConfigPath({ ...options, cwd });
	const exported = await loadConfigModule(configFilePath);
	const userConfig = materializeUserConfig(exported, configFilePath);
	return await finalizeEcoPagesConfig(userConfig, { configFilePath, cwd });
}
