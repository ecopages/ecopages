import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import { SERVER_BUNDLE_DIR } from '../utils/resolve-entry-file.ts';
import { EMITTED_ECO_CONFIG_FILENAME } from './server-config-bundle.ts';

export const DEFAULT_ECO_CONFIG_FILENAME = 'eco.config.ts';

export const ECOPAGES_CONFIG_FILE_ENV = 'ECOPAGES_CONFIG_FILE';

/**
 * Resolves the project root used when `EcoPagesUserConfig.rootDir` is omitted.
 *
 * @remarks
 * Defaults to `cwd` so source configs, in-memory `createApp({ userConfig })`,
 * and production loads of `dist/.server/eco.config.mjs` share one rule.
 * `path.resolve` keeps an explicit absolute `rootDir` unchanged.
 */
export function resolveUserConfigRootDir(rootDir?: string, cwd = process.cwd()): string {
	return path.resolve(cwd, rootDir ?? '.');
}

export type ResolveEcoConfigPathOptions = {
	configFile?: string;
	cwd?: string;
	required?: boolean;
	/** Prefer the emitted production config over the source config when both exist. */
	preferEmitted?: boolean;
};

/** Resolves the emitted production config without consulting source overrides. */
export function resolveEmittedEcoConfigPath(cwd = process.cwd()): string | undefined {
	const candidates = [
		path.resolve(cwd, 'dist', SERVER_BUNDLE_DIR, EMITTED_ECO_CONFIG_FILENAME),
		path.resolve(cwd, SERVER_BUNDLE_DIR, EMITTED_ECO_CONFIG_FILENAME),
	];
	return candidates.find((candidate) => fileSystem.exists(candidate));
}

/**
 * Resolves the canonical absolute path to the Ecopages config module.
 *
 * @remarks
 * Precedence: explicit `configFile`, then `ECOPAGES_CONFIG_FILE`, then
 * `<cwd>/eco.config.ts`, then the emitted production config. When `preferEmitted`
 * is enabled, the emitted config precedes the source config.
 */
export function resolveEcoConfigPath(options: ResolveEcoConfigPathOptions & { required: false }): string | undefined;
export function resolveEcoConfigPath(options?: ResolveEcoConfigPathOptions): string;
export function resolveEcoConfigPath(options: ResolveEcoConfigPathOptions = {}): string | undefined {
	const cwd = options.cwd ?? process.cwd();
	const required = options.required ?? true;

	if (options.configFile) {
		const resolved = path.isAbsolute(options.configFile)
			? options.configFile
			: path.resolve(cwd, options.configFile);
		if (!fileSystem.exists(resolved)) {
			throw new Error(`Ecopages config file not found: ${resolved}`);
		}
		return resolved;
	}

	const envPath = process.env[ECOPAGES_CONFIG_FILE_ENV];
	if (envPath) {
		const resolved = path.isAbsolute(envPath) ? envPath : path.resolve(cwd, envPath);
		if (!fileSystem.exists(resolved)) {
			throw new Error(`Ecopages config file not found: ${resolved}`);
		}
		return resolved;
	}

	const defaultPath = path.resolve(cwd, DEFAULT_ECO_CONFIG_FILENAME);
	const emittedConfigPath = resolveEmittedEcoConfigPath(cwd);
	if (options.preferEmitted && emittedConfigPath) return emittedConfigPath;
	if (fileSystem.exists(defaultPath)) return defaultPath;
	if (emittedConfigPath) return emittedConfigPath;

	if (!required) {
		return undefined;
	}

	throw new Error(`Ecopages config file not found: ${defaultPath}`);
}
