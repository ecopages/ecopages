import path from 'node:path';
import { getEcopagesEnv } from '../env.ts';
import { fileSystem } from '@ecopages/file-system';
import { SERVER_BUNDLE_DIR } from '../utils/resolve-entry-file.ts';
import { getProductionServerBundleDir } from '../utils/server-bundle-context.ts';
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
	/**
	 * The build output directory, relative to `cwd`, whose emitted config may be used.
	 * Without it only a config beside the running server bundle counts as emitted.
	 */
	distDir?: string;
};

/** Resolves the emitted production config of one build output directory without consulting source overrides. */
export function resolveEmittedEcoConfigPath(cwd: string, distDir: string): string | undefined {
	const candidate = path.resolve(cwd, distDir, SERVER_BUNDLE_DIR, EMITTED_ECO_CONFIG_FILENAME);
	return fileSystem.exists(candidate) ? candidate : undefined;
}

/**
 * Returns the emitted config next to the running server bundle.
 *
 * @remarks
 * The generated loader records its own directory before dynamically importing the
 * application bundle. The application may be launched by a wrapper, so `process.argv[1]`
 * does not reliably identify the server bundle. `ecopages dev` has no loader context and
 * keeps using `eco.config.ts`.
 */
function resolveRunningServerBundleConfigPath(serverBundleDir?: string): string | undefined {
	const resolvedServerBundleDir = serverBundleDir ?? getProductionServerBundleDir();
	if (!resolvedServerBundleDir) return undefined;
	const candidate = path.join(resolvedServerBundleDir, EMITTED_ECO_CONFIG_FILENAME);
	return fileSystem.exists(candidate) ? candidate : undefined;
}

/**
 * Resolves the canonical absolute path to the Ecopages config module.
 *
 * @remarks
 * Precedence: explicit `configFile`, then `ECOPAGES_CONFIG_FILE`, then the
 * emitted config next to a running server bundle, then `<cwd>/eco.config.ts`,
 * then the emitted production config. When `preferEmitted` is enabled, the
 * emitted config precedes the source config.
 */
export function resolveEcoConfigPath(options: ResolveEcoConfigPathOptions & { required: false }): string | undefined;
export function resolveEcoConfigPath(options?: ResolveEcoConfigPathOptions): string;
export function resolveEcoConfigPath(options: ResolveEcoConfigPathOptions = {}): string | undefined {
	return resolveEcoConfigPathWithServerBundleDir(options, getProductionServerBundleDir());
}

export function resolveEcoConfigPathFromServerBundle(
	options: ResolveEcoConfigPathOptions,
	serverBundleDir: string,
): string {
	const resolvedPath = resolveEcoConfigPathWithServerBundleDir(options, serverBundleDir);
	if (!resolvedPath) throw new Error('Ecopages config path was unexpectedly unresolved.');
	return resolvedPath;
}

function resolveEcoConfigPathWithServerBundleDir(
	options: ResolveEcoConfigPathOptions,
	serverBundleDir: string | undefined,
): string | undefined {
	const cwd = options.cwd ?? process.cwd();
	const required = options.required ?? true;

	const explicitPath = options.configFile || getEcopagesEnv(ECOPAGES_CONFIG_FILE_ENV);
	if (explicitPath) {
		const resolved = path.resolve(cwd, explicitPath);
		if (!fileSystem.exists(resolved)) {
			throw new Error(`Ecopages config file not found: ${resolved}`);
		}
		return resolved;
	}

	const serverBundleConfigPath = resolveRunningServerBundleConfigPath(serverBundleDir);
	if (serverBundleConfigPath) return serverBundleConfigPath;

	const defaultPath = path.resolve(cwd, DEFAULT_ECO_CONFIG_FILENAME);
	const emittedConfigPath = options.distDir ? resolveEmittedEcoConfigPath(cwd, options.distDir) : undefined;
	if (options.preferEmitted && emittedConfigPath) return emittedConfigPath;
	if (fileSystem.exists(defaultPath)) return defaultPath;
	if (emittedConfigPath) return emittedConfigPath;

	if (!required) {
		return undefined;
	}

	throw new Error(`Ecopages config file not found: ${defaultPath}`);
}
