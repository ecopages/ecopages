import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import { DEFAULT_ECOPAGES_DIST_DIR } from '../config/constants.ts';
import type { EcoPagesAppConfig } from '../types/internal-types.ts';
import { SERVER_BUNDLE_DIR, SERVER_BUNDLE_FILENAME } from '../utils/resolve-entry-file.ts';

const SERVER_BUNDLE_MANIFEST_FILENAME = 'manifest.json';

/**
 * Describes the server bundle in `<distDir>/.server/manifest.json`.
 *
 * @remarks
 * Every path is relative, so the bundle runs from any directory that keeps `dist/`
 * and the sources in their relative positions. `serverEntry` and `emittedConfigModule`
 * are relative to the manifest directory, `sourceConfigRelativePath` to the project root.
 */
export interface ServerBundleDeployManifest {
	serverEntry: string;
	sourceConfigRelativePath?: string;
	emittedConfigModule?: string;
	/** Content hash of the source config file when built. */
	configHash?: string;
	/** Content hash of the emitted production config artifact. */
	emittedConfigHash?: string;
}

export function getServerBundleOutputPaths(appConfig: EcoPagesAppConfig): {
	distDir: string;
	serverOutdir: string;
	serverEntryPath: string;
	manifestPath: string;
} {
	const distDir = appConfig.absolutePaths?.distDir ?? path.join(appConfig.rootDir, appConfig.distDir);
	const serverOutdir = path.join(distDir, SERVER_BUNDLE_DIR);
	const serverEntryPath = path.join(serverOutdir, SERVER_BUNDLE_FILENAME);
	const manifestPath = path.join(serverOutdir, SERVER_BUNDLE_MANIFEST_FILENAME);

	return { distDir, serverOutdir, serverEntryPath, manifestPath };
}

/**
 * Hashes a config file recorded in, or checked against, the deploy manifest.
 *
 * @remarks
 * The build may run under Bun while `ecopages start` checks the manifest under Node, so the hash must not depend
 * on the runtime or on the file-system implementation. SHA-256 is computed here rather than through
 * `fileSystem.hash`; it equals that hash today, so manifests written by earlier builds stay valid.
 */
function hashDeployConfigFile(filePath: string): string {
	return createHash('sha256').update(fileSystem.readFileAsBuffer(filePath)).digest('hex');
}

function hashExistingFile(filePath: string | undefined): string | undefined {
	return filePath && fileSystem.exists(filePath) ? hashDeployConfigFile(filePath) : undefined;
}

/**
 * Writes the deploy manifest beside the server entry.
 *
 * @param options.outputDir - Directory that receives the manifest instead of the published server directory,
 * such as the staging directory of a build in progress.
 */
export function writeServerBundleDeployManifest(
	appConfig: EcoPagesAppConfig,
	serverEntryPath: string,
	options?: { emittedConfigModule?: string; outputDir?: string },
): void {
	const manifestDir = options?.outputDir ?? getServerBundleOutputPaths(appConfig).serverOutdir;
	const sourceConfigPath = appConfig.absolutePaths?.config;
	const emittedConfigPath = options?.emittedConfigModule
		? path.join(manifestDir, options.emittedConfigModule)
		: undefined;

	const payload: ServerBundleDeployManifest = {
		serverEntry: path.relative(manifestDir, serverEntryPath),
		sourceConfigRelativePath: sourceConfigPath ? path.relative(appConfig.rootDir, sourceConfigPath) : undefined,
		emittedConfigModule: options?.emittedConfigModule,
		configHash: hashExistingFile(sourceConfigPath),
		emittedConfigHash: hashExistingFile(emittedConfigPath),
	};
	fileSystem.ensureDir(manifestDir);
	fileSystem.write(
		path.join(manifestDir, SERVER_BUNDLE_MANIFEST_FILENAME),
		`${JSON.stringify(payload, null, '\t')}\n`,
	);
}

function resolveServerBundleDir(rootDir: string, distDir: string): string {
	return path.resolve(rootDir, distDir, SERVER_BUNDLE_DIR);
}

function readServerBundleDeployManifest(serverDir: string): ServerBundleDeployManifest | undefined {
	const manifestPath = path.join(serverDir, SERVER_BUNDLE_MANIFEST_FILENAME);
	if (!fileSystem.exists(manifestPath)) {
		return undefined;
	}

	try {
		return JSON.parse(fileSystem.readFileSync(manifestPath).toString()) as ServerBundleDeployManifest;
	} catch {
		return undefined;
	}
}

/**
 * Selects the build output directory whose server bundle `ecopages start` runs.
 *
 * @remarks
 * `ecopages start` does not load the app config, so it cannot read `distDir` from it. A given `distDir` is used
 * as is. Otherwise the directories directly below `cwd` that hold `.server/manifest.json` are the candidates:
 * one is used, none or several fail. Guessing between several would run a stale bundle from an earlier build
 * that used another `distDir`.
 *
 * @param options.cwd - Project root.
 * @param options.distDir - Directory named with `--dist-dir`, relative to `cwd`.
 * @returns The absolute path of the build output directory.
 */
export async function resolveProductionDistDir(options: { cwd?: string; distDir?: string } = {}): Promise<string> {
	const cwd = path.resolve(options.cwd ?? process.cwd());
	const describe = (distDir: string) => path.relative(cwd, distDir) || '.';

	if (options.distDir !== undefined) {
		const distDir = path.resolve(cwd, options.distDir);
		if (!fileSystem.exists(path.join(resolveServerBundleDir(cwd, distDir), SERVER_BUNDLE_MANIFEST_FILENAME))) {
			throw new Error(
				`No production bundle found in ${describe(distDir)}/${SERVER_BUNDLE_DIR}. Run \`ecopages build\` first.`,
			);
		}
		return distDir;
	}

	const manifests = await fileSystem.glob([`*/${SERVER_BUNDLE_DIR}/${SERVER_BUNDLE_MANIFEST_FILENAME}`], { cwd });
	const distDirs = manifests.map((manifest) => path.resolve(cwd, manifest, '..', '..')).sort();
	if (distDirs.length > 1) {
		throw new Error(
			`Multiple production bundles found: ${distDirs.map(describe).join(', ')}. Pass --dist-dir <dir> to select one.`,
		);
	}
	if (distDirs.length === 0) {
		throw new Error('No production bundle found. Run `ecopages build` before starting in production mode.');
	}
	return distDirs[0]!;
}

/**
 * Returns the server entry that `ecopages start` runs, or `undefined` when no server bundle was built.
 *
 * @param rootDir - Project root; `distDir` is relative to it.
 * @param distDir - The app's `distDir` setting.
 */
export function resolveProductionServerEntry(
	rootDir = process.cwd(),
	distDir = DEFAULT_ECOPAGES_DIST_DIR,
): string | undefined {
	const serverDir = resolveServerBundleDir(rootDir, distDir);
	const manifest = readServerBundleDeployManifest(serverDir);
	const serverEntryPath = path.join(serverDir, manifest?.serverEntry ?? SERVER_BUNDLE_FILENAME);
	return fileSystem.exists(serverEntryPath) ? serverEntryPath : undefined;
}

function isEmittedConfigArtifact(
	manifest: ServerBundleDeployManifest,
	manifestDir: string,
	requestedPath: string,
): boolean {
	if (!manifest.emittedConfigModule) {
		return false;
	}
	const emittedArtifactPath = path.resolve(manifestDir, manifest.emittedConfigModule);
	if (path.resolve(requestedPath) !== emittedArtifactPath) return false;
	return (
		!manifest.emittedConfigHash ||
		(fileSystem.exists(requestedPath) && hashDeployConfigFile(requestedPath) === manifest.emittedConfigHash)
	);
}

function matchesBuiltConfigHash(manifest: ServerBundleDeployManifest, requestedPath: string): boolean {
	if (!manifest.configHash || !fileSystem.exists(requestedPath)) {
		return false;
	}
	return hashDeployConfigFile(requestedPath) === manifest.configHash;
}

function matchesBuiltConfigPath(
	manifest: ServerBundleDeployManifest,
	rootDir: string,
	requestedPath: string,
	isExplicitOverride?: boolean,
): boolean {
	if (manifest.configHash || isExplicitOverride || !manifest.sourceConfigRelativePath) return false;
	return path.relative(rootDir, requestedPath) === manifest.sourceConfigRelativePath;
}

function hasConfigIdentity(manifest: ServerBundleDeployManifest): boolean {
	return Boolean(manifest.emittedConfigModule || manifest.configHash || manifest.sourceConfigRelativePath);
}

/**
 * @remarks
 * Production `start` must not load a different config than the one compiled into the bundle.
 *
 * @param rootDir - Project root; `distDir` is relative to it.
 * @param options.distDir - The app's `distDir` setting.
 */
export function assertProductionConfigIdentity(
	rootDir: string,
	requestedConfigPath: string | undefined,
	options?: { isExplicitOverride?: boolean; distDir?: string },
): void {
	if (!requestedConfigPath) {
		return;
	}

	const manifestDir = resolveServerBundleDir(rootDir, options?.distDir ?? DEFAULT_ECOPAGES_DIST_DIR);
	const manifest = readServerBundleDeployManifest(manifestDir);
	if (!manifest || !hasConfigIdentity(manifest)) return;

	if (
		isEmittedConfigArtifact(manifest, manifestDir, requestedConfigPath) ||
		matchesBuiltConfigHash(manifest, requestedConfigPath) ||
		matchesBuiltConfigPath(manifest, rootDir, requestedConfigPath, options?.isExplicitOverride)
	) {
		return;
	}

	const expected = manifest.sourceConfigRelativePath ?? 'bundled config';
	throw new Error(
		`Ecopages config mismatch: production bundle was built with ${expected}, but start requested ${requestedConfigPath}.`,
	);
}
