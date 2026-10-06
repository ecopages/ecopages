import { createHash } from 'node:crypto';
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

function readDeployManifest(appConfigOrCwd: EcoPagesAppConfig | string): ServerBundleDeployManifest | undefined {
	return typeof appConfigOrCwd === 'string'
		? readServerBundleDeployManifestFromDir(appConfigOrCwd)
		: readServerBundleDeployManifest(appConfigOrCwd);
}

function hasConfigIdentity(manifest: ServerBundleDeployManifest): boolean {
	return Boolean(
		manifest.emittedConfigModule ||
		manifest.configHash ||
		manifest.sourceConfigPath ||
		manifest.sourceConfigRelativePath,
	);
}

function resolveDeployManifestDirectory(appConfigOrCwd: EcoPagesAppConfig | string): string {
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
	options?: { isExplicitOverride?: boolean },
): void {
	if (!requestedConfigPath) {
		return;
	}

	const manifest = readDeployManifest(appConfigOrCwd);
	if (!manifest || !hasConfigIdentity(manifest)) return;

	const manifestDir = resolveDeployManifestDirectory(appConfigOrCwd);

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

export function readServerBundleDeployManifestFromDir(cwd = process.cwd()): ServerBundleDeployManifest | undefined {
	const manifestPath = path.join(cwd, 'dist', SERVER_BUNDLE_DIR, SERVER_BUNDLE_MANIFEST_FILENAME);
	if (!fileSystem.exists(manifestPath)) {
		return undefined;
	}

	try {
		return JSON.parse(fileSystem.readFileSync(manifestPath).toString()) as ServerBundleDeployManifest;
	} catch {
		return undefined;
	}
}

export function resolveProductionServerEntry(cwd = process.cwd()): string | undefined {
	const manifestPath = path.join(cwd, 'dist', SERVER_BUNDLE_DIR, SERVER_BUNDLE_MANIFEST_FILENAME);
	if (fileSystem.exists(manifestPath)) {
		try {
			const parsed = JSON.parse(fileSystem.readFileSync(manifestPath).toString()) as ServerBundleDeployManifest;
			if (parsed?.serverEntry) {
				const fromManifest = path.isAbsolute(parsed.serverEntry)
					? parsed.serverEntry
					: path.join(path.dirname(manifestPath), parsed.serverEntry);
				if (fileSystem.exists(fromManifest)) {
					return fromManifest;
				}
			}
			if (parsed?.distDir) {
				const fromDistDir = path.join(parsed.distDir, SERVER_BUNDLE_DIR, SERVER_BUNDLE_FILENAME);
				if (fileSystem.exists(fromDistDir)) {
					return fromDistDir;
				}
			}
		} catch {
			// fall through to legacy path
		}
	}

	const legacyPath = path.join(cwd, 'dist', SERVER_BUNDLE_DIR, SERVER_BUNDLE_FILENAME);
	return fileSystem.exists(legacyPath) ? legacyPath : undefined;
}
