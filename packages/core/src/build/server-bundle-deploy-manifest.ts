import { contentHash } from '../utils/content-hash.ts';
import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import type { EcoPagesAppConfig } from '../config/internal-types.ts';
import { SERVER_BUNDLE_DIR, SERVER_BUNDLE_FILENAME } from '../utils/resolve-entry-file.ts';
import { ensureProductionBuildId } from './production-build-id.ts';

const SERVER_BUNDLE_MANIFEST_FILENAME = 'manifest.json';
const DEFAULT_DIST_DIR = 'dist';

/**
 * Describes the server bundle in `<distDir>/.server/manifest.json`.
 *
 * @remarks
 * Every path is relative, so the bundle runs from any directory that holds
 * `dist/` and `node_modules/`. `serverEntry` and `emittedConfigModule` are
 * relative to the manifest directory. `buildId` is shared with the other
 * production manifests so `ecopages start` can refuse a mixed `dist/`.
 */
export interface ServerBundleDeployManifest {
	serverEntry: string;
	emittedConfigModule?: string;
	/** Content hash of the emitted production config artifact. */
	emittedConfigHash?: string;
	/** Id shared with `routes.json`, `server-modules.json`, and the browser-client manifest. */
	buildId?: string;
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
 * `fileSystem.hash`. Start compares this hash of the emitted config only.
 */
function hashDeployConfigFile(filePath: string): string {
	return contentHash(fileSystem.readFileAsBuffer(filePath));
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
	const emittedConfigPath = options?.emittedConfigModule
		? path.join(manifestDir, options.emittedConfigModule)
		: undefined;

	const payload: ServerBundleDeployManifest = {
		serverEntry: path.relative(manifestDir, serverEntryPath),
		emittedConfigModule: options?.emittedConfigModule,
		emittedConfigHash: hashExistingFile(emittedConfigPath),
		buildId: ensureProductionBuildId(appConfig),
	};
	fileSystem.ensureDir(manifestDir);
	fileSystem.write(
		path.join(manifestDir, SERVER_BUNDLE_MANIFEST_FILENAME),
		`${JSON.stringify(payload, null, '\t')}\n`,
	);
	fileSystem.write(path.join(manifestDir, 'package.json'), `${JSON.stringify({ type: 'module' }, null, '\t')}\n`);
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
 * one is used, none or several fail. Dot-prefixed directories count; symlinked and nested outputs (`out/web`) do
 * not, and need `--dist-dir`. Guessing between several would run a stale bundle from an earlier build
 * that used another `distDir`.
 *
 * Static-only apps (no API handlers, WebSocket handlers or endpoint files) build no server bundle. When the selected output, or `dist`
 * when none is named, holds built HTML but no bundle, the error says so and points to `ecopages preview`
 * instead of asking for another build. A static-only build in a custom `distDir` needs `--dist-dir` to be
 * recognised.
 *
 * @param options.cwd - Project root.
 * @param options.distDir - Directory named with `--dist-dir`, relative to `cwd`.
 * @returns The absolute path of the build output directory.
 */
export async function resolveProductionDistDir(options: { cwd?: string; distDir?: string } = {}): Promise<string> {
	const cwd = path.resolve(options.cwd ?? process.cwd());
	const describe = (distDir: string) => path.relative(cwd, distDir) || '.';

	const staticOnlyError = (distDir: string) =>
		new Error(
			`${describe(distDir)}/ holds a static-only build: it has no server bundle, so \`ecopages start\` cannot run it. Serve it with \`ecopages preview\` or deploy ${describe(distDir)}/ to a static host.`,
		);
	const holdsBuiltHtml = (distDir: string) => fileSystem.exists(path.join(distDir, 'index.html'));

	if (options.distDir !== undefined) {
		const distDir = path.resolve(cwd, options.distDir);
		if (!fileSystem.exists(path.join(resolveServerBundleDir(cwd, distDir), SERVER_BUNDLE_MANIFEST_FILENAME))) {
			throw holdsBuiltHtml(distDir)
				? staticOnlyError(distDir)
				: new Error(
						`No production bundle found in ${describe(distDir)}/${SERVER_BUNDLE_DIR}. Run \`ecopages build\` first.`,
					);
		}
		return distDir;
	}

	const manifests = await fileSystem.glob([`{*,.*}/${SERVER_BUNDLE_DIR}/${SERVER_BUNDLE_MANIFEST_FILENAME}`], {
		cwd,
	});
	const distDirs = manifests.map((manifest) => path.resolve(cwd, manifest, '..', '..')).sort();
	if (distDirs.length > 1) {
		throw new Error(
			`Multiple production bundles found: ${distDirs.map(describe).join(', ')}. Pass --dist-dir <dir> to select one.`,
		);
	}
	if (distDirs.length === 0) {
		const defaultDistDir = path.join(cwd, DEFAULT_DIST_DIR);
		if (holdsBuiltHtml(defaultDistDir)) {
			throw staticOnlyError(defaultDistDir);
		}
		throw new Error(
			'No production bundle found. Run `ecopages build` before starting in production mode, or pass --dist-dir <dir> for an output that is not a direct subdirectory.',
		);
	}
	return distDirs[0]!;
}

/**
 * Returns the server entry that `ecopages start` runs, or `undefined` when the build output has no manifest or its entry is missing.
 *
 * @param rootDir - Project root; `distDir` is relative to it.
 * @param distDir - The build output directory.
 */
export function resolveProductionServerEntry(rootDir: string, distDir: string): string | undefined {
	const serverDir = resolveServerBundleDir(rootDir, distDir);
	const manifest = readServerBundleDeployManifest(serverDir);
	if (!manifest) return undefined;

	const serverEntryPath = path.join(serverDir, manifest.serverEntry);
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

function hasConfigIdentity(manifest: ServerBundleDeployManifest): boolean {
	return Boolean(manifest.emittedConfigModule || manifest.emittedConfigHash);
}

/**
 * @remarks
 * Production `start` must not load a different config than the one compiled into the bundle.
 * It compares only the emitted config artifact; it does not read source files.
 *
 * @param rootDir - Project root; `options.distDir` is relative to it.
 * @param options.distDir - The build output directory whose manifest is checked.
 * @throws When that directory has no readable manifest, or the config differs from the one built.
 */
export function assertProductionConfigIdentity(
	rootDir: string,
	requestedConfigPath: string | undefined,
	options: { distDir: string },
): void {
	if (!requestedConfigPath) {
		return;
	}

	const manifestDir = resolveServerBundleDir(rootDir, options.distDir);
	const manifest = readServerBundleDeployManifest(manifestDir);
	if (!manifest) {
		throw new Error(
			`No readable production bundle manifest in ${path.join(manifestDir, SERVER_BUNDLE_MANIFEST_FILENAME)}. Run \`ecopages build\` again.`,
		);
	}
	if (!hasConfigIdentity(manifest)) return;

	if (isEmittedConfigArtifact(manifest, manifestDir, requestedConfigPath)) {
		return;
	}

	throw new Error(
		`Ecopages config mismatch: production bundle was built with bundled config, but start requested ${requestedConfigPath}.`,
	);
}
