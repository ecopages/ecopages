import { createHash } from 'node:crypto';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import { SERVER_BUNDLE_DIR, SERVER_BUNDLE_FILENAME } from '../../utils/resolve-entry-file.ts';

export const SERVER_BUNDLE_MANIFEST_FILENAME = 'manifest.json';

export interface ServerBundleDeployManifest {
	serverEntry: string;
	distDir: string;
	builtAt: number;
	/** Canonical source config path compiled into the server bundle. */
	sourceConfigPath?: string;
	/** Relative source config path from project root. */
	sourceConfigRelativePath?: string;
	/** Deployed config module path relative to the server bundle directory. */
	emittedConfigModule?: string;
	/** Content hash of the source config file when built. */
	configHash?: string;
	/** Content hash of the emitted production config artifact. */
	emittedConfigHash?: string;
}

export type ResolvedProductionServerBundle = {
	distDir: string;
	serverBundleDirectory: string;
	serverEntryPath: string;
	manifest: ServerBundleDeployManifest;
};

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
 * The build may run under Bun while `ecopages start` checks the manifest under Node, so this uses SHA-256 rather
 * than `fileSystem.hash`, which is `Bun.hash` under Bun. The output matches the Node adapter's hash, so manifests
 * written by a Node build stay valid.
 */
function hashDeployConfigFile(filePath: string): string {
	return createHash('sha256').update(fileSystem.readFileAsBuffer(filePath)).digest('hex');
}

function hashExistingFile(filePath: string | undefined): string | undefined {
	return filePath && fileSystem.exists(filePath) ? hashDeployConfigFile(filePath) : undefined;
}

export function writeServerBundleDeployManifest(
	appConfig: EcoPagesAppConfig,
	serverEntryPath: string,
	options?: Pick<ServerBundleDeployManifest, 'sourceConfigPath' | 'emittedConfigModule'> & {
		outputDir?: string;
	},
): void {
	const { distDir, manifestPath: defaultManifestPath } = getServerBundleOutputPaths(appConfig);
	const manifestPath = options?.outputDir
		? path.join(options.outputDir, SERVER_BUNDLE_MANIFEST_FILENAME)
		: defaultManifestPath;
	fileSystem.ensureDir(path.dirname(manifestPath));
	const sourceConfigPath = options?.sourceConfigPath ?? appConfig.absolutePaths?.config;
	const emittedConfigPath = options?.emittedConfigModule
		? path.resolve(path.dirname(manifestPath), options.emittedConfigModule)
		: undefined;

	const payload: ServerBundleDeployManifest = {
		serverEntry: path.relative(path.dirname(manifestPath), serverEntryPath) || SERVER_BUNDLE_FILENAME,
		distDir,
		builtAt: Date.now(),
		sourceConfigPath,
		sourceConfigRelativePath: sourceConfigPath ? path.relative(appConfig.rootDir, sourceConfigPath) : undefined,
		emittedConfigModule: options?.emittedConfigModule,
		configHash: hashExistingFile(sourceConfigPath),
		emittedConfigHash: hashExistingFile(emittedConfigPath),
	};
	fileSystem.write(manifestPath, `${JSON.stringify(payload, null, '\t')}\n`);
}

export function readServerBundleDeployManifest(appConfig: EcoPagesAppConfig): ServerBundleDeployManifest | undefined {
	const { manifestPath } = getServerBundleOutputPaths(appConfig);
	if (!fileSystem.exists(manifestPath)) {
		return undefined;
	}

	try {
		return JSON.parse(fileSystem.readFileSync(manifestPath).toString()) as ServerBundleDeployManifest;
	} catch {
		return undefined;
	}
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
	cwd: string,
	requestedPath: string,
	isExplicitOverride?: boolean,
): boolean {
	if (manifest.configHash) return false;

	if (!isExplicitOverride && manifest.sourceConfigRelativePath) {
		if (path.relative(cwd, requestedPath) === manifest.sourceConfigRelativePath) {
			return true;
		}
	}
	if (manifest.sourceConfigPath && path.resolve(requestedPath) === path.resolve(manifest.sourceConfigPath)) {
		return true;
	}
	return false;
}

function readDeployManifestAtBundleDirectory(serverBundleDirectory: string): ServerBundleDeployManifest | undefined {
	const manifestPath = path.join(serverBundleDirectory, SERVER_BUNDLE_MANIFEST_FILENAME);
	if (!fileSystem.exists(manifestPath)) {
		return undefined;
	}

	try {
		return JSON.parse(fileSystem.readFileSync(manifestPath).toString()) as ServerBundleDeployManifest;
	} catch {
		return undefined;
	}
}

function readDeployManifest(
	appConfigOrCwd: EcoPagesAppConfig | string,
	serverBundleDirectory?: string,
): ServerBundleDeployManifest | undefined {
	if (serverBundleDirectory) {
		return readDeployManifestAtBundleDirectory(serverBundleDirectory);
	}

	if (typeof appConfigOrCwd !== 'string') {
		return readServerBundleDeployManifest(appConfigOrCwd);
	}

	return readDeployManifestAtBundleDirectory(path.join(appConfigOrCwd, 'dist', SERVER_BUNDLE_DIR));
}

function hasConfigIdentity(manifest: ServerBundleDeployManifest): boolean {
	return Boolean(
		manifest.emittedConfigModule ||
		manifest.configHash ||
		manifest.sourceConfigPath ||
		manifest.sourceConfigRelativePath,
	);
}

function resolveDeployManifestDirectory(
	appConfigOrCwd: EcoPagesAppConfig | string,
	serverBundleDirectory?: string,
): string {
	if (serverBundleDirectory) {
		return serverBundleDirectory;
	}

	return typeof appConfigOrCwd === 'string'
		? path.join(appConfigOrCwd, 'dist', SERVER_BUNDLE_DIR)
		: getServerBundleOutputPaths(appConfigOrCwd).serverOutdir;
}

/**
 * @remarks
 * Production `start` must not load a different config than the one compiled into the bundle.
 */
export function assertProductionConfigIdentity(
	appConfigOrCwd: EcoPagesAppConfig | string,
	requestedConfigPath: string | undefined,
	options?: { isExplicitOverride?: boolean; serverBundleDirectory?: string },
): void {
	if (!requestedConfigPath) {
		return;
	}

	const manifest = readDeployManifest(appConfigOrCwd, options?.serverBundleDirectory);
	if (!manifest || !hasConfigIdentity(manifest)) return;

	const manifestDir = resolveDeployManifestDirectory(appConfigOrCwd, options?.serverBundleDirectory);

	if (isEmittedConfigArtifact(manifest, manifestDir, requestedConfigPath)) {
		return;
	}

	if (matchesBuiltConfigHash(manifest, requestedConfigPath)) {
		return;
	}

	const cwd = typeof appConfigOrCwd === 'string' ? appConfigOrCwd : appConfigOrCwd.rootDir;
	if (matchesBuiltConfigPath(manifest, cwd, requestedConfigPath, options?.isExplicitOverride)) {
		return;
	}

	const expected = manifest.sourceConfigRelativePath ?? manifest.sourceConfigPath ?? 'bundled config';
	throw new Error(
		`Ecopages config mismatch: production bundle was built with ${expected}, but start requested ${requestedConfigPath}.`,
	);
}

/**
 * Resolves the one production server bundle that `ecopages start` should run.
 *
 * @remarks
 * Without an explicit `distDir`, each immediate app-root directory is checked
 * for a `.server/manifest.json`. Ambiguous output directories require the user
 * to select one with `--dist-dir`; bundles without manifests are not guessed.
 */
export function resolveProductionServerBundle(
	options: {
		cwd?: string;
		distDir?: string;
	} = {},
): ResolvedProductionServerBundle {
	const cwd = path.resolve(options.cwd ?? process.cwd());
	const explicitDistDir = options.distDir === undefined ? undefined : path.resolve(cwd, options.distDir);
	const candidateDistDirs = explicitDistDir
		? [explicitDistDir]
		: readdirSync(cwd, { withFileTypes: true })
				.filter((entry) => entry.name !== 'node_modules')
				.map((entry) => path.join(cwd, entry.name))
				.filter((candidate) => {
					try {
						return statSync(candidate).isDirectory();
					} catch {
						return false;
					}
				});
	const matches = candidateDistDirs.filter((distDir) =>
		fileSystem.exists(path.join(distDir, SERVER_BUNDLE_DIR, SERVER_BUNDLE_MANIFEST_FILENAME)),
	);

	if (matches.length > 1) {
		const listedDirs = matches.map((distDir) => path.relative(cwd, distDir) || '.').sort();
		throw new Error(
			`Multiple production bundles found: ${listedDirs.join(', ')}. Pass --dist-dir <dir> to select one.`,
		);
	}

	if (matches.length === 0) {
		const location = explicitDistDir
			? ` in ${path.relative(cwd, explicitDistDir) || '.'}/${SERVER_BUNDLE_DIR}`
			: '';
		throw new Error(
			`No production bundle found${location}. Run \`ecopages build\` before starting in production mode.`,
		);
	}

	const distDir = matches[0]!;
	const serverBundleDirectory = path.join(distDir, SERVER_BUNDLE_DIR);
	const manifestPath = path.join(serverBundleDirectory, SERVER_BUNDLE_MANIFEST_FILENAME);
	let manifest: ServerBundleDeployManifest;
	try {
		manifest = JSON.parse(fileSystem.readFileSync(manifestPath).toString()) as ServerBundleDeployManifest;
	} catch (error) {
		const details = error instanceof Error ? `: ${error.message}` : '';
		throw new Error(`Invalid production server bundle manifest at ${manifestPath}${details}`);
	}

	if (typeof manifest.serverEntry !== 'string' || manifest.serverEntry.length === 0) {
		throw new Error(`Production server bundle manifest has no serverEntry: ${manifestPath}`);
	}

	const serverEntryPath = path.isAbsolute(manifest.serverEntry)
		? manifest.serverEntry
		: path.resolve(serverBundleDirectory, manifest.serverEntry);
	if (!fileSystem.exists(serverEntryPath)) {
		throw new Error(`Production server bundle entry not found: ${serverEntryPath}. Run ecopages build again.`);
	}

	return { distDir, serverBundleDirectory, serverEntryPath, manifest };
}
