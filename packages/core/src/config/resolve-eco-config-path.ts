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
 * Returns the emitted config next to the running entry when that entry is a
 * server bundle, such as `node dist/.server/app.mjs` or `bun dist/.server/app.mjs`.
 *
 * @remarks
 * Reads `process.argv[1]` rather than `import.meta`, because server builds
 * rewrite bundled `import.meta` to the source location. The source config
 * would make Node import TypeScript from `node_modules`, which it does not
 * strip. `ecopages dev` runs the source entry, so it keeps `eco.config.ts`.
 */
function resolveRunningServerBundleConfigPath(): string | undefined {
	const entry = process.argv[1];
	if (!entry) return undefined;
	const entryDir = path.dirname(path.resolve(entry));
	if (path.basename(entryDir) !== SERVER_BUNDLE_DIR) return undefined;
	const candidate = path.join(entryDir, EMITTED_ECO_CONFIG_FILENAME);
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
	const cwd = options.cwd ?? process.cwd();
	const required = options.required ?? true;

	const explicitPath = options.configFile || process.env[ECOPAGES_CONFIG_FILE_ENV];
	if (explicitPath) {
		const resolved = path.resolve(cwd, explicitPath);
		if (!fileSystem.exists(resolved)) {
			throw new Error(`Ecopages config file not found: ${resolved}`);
		}
		return resolved;
	}

	const serverBundleConfigPath = resolveRunningServerBundleConfigPath();
	if (serverBundleConfigPath) return serverBundleConfigPath;

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
