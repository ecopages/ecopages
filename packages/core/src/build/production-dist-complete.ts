import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import { SERVER_BUNDLE_DIR } from '../utils/resolve-entry-file.ts';
import { PRODUCTION_ROUTES_FILENAME } from './production-route-list.ts';
import { SERVER_MODULES_MANIFEST_FILENAME } from './server/server-modules-manifest.ts';

const BROWSER_CLIENT_MANIFEST_FILENAME = 'browser-client-manifest.json';

function describe(rootDir: string, filePath: string): string {
	return path.relative(rootDir, filePath) || '.';
}

type JsonObjectReadResult =
	{ kind: 'valid'; value: Record<string, unknown> } | { kind: 'missing' } | { kind: 'invalid'; error: unknown };

function readJsonObject(filePath: string): JsonObjectReadResult {
	if (!fileSystem.exists(filePath)) {
		return { kind: 'missing' };
	}
	try {
		const parsed: unknown = JSON.parse(fileSystem.readFileSync(filePath));
		if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
			return { kind: 'invalid', error: new TypeError('Expected a JSON object.') };
		}
		return { kind: 'valid', value: parsed as Record<string, unknown> };
	} catch (error) {
		return { kind: 'invalid', error };
	}
}

function requireJsonObject(rootDir: string, filePath: string, label: string): Record<string, unknown> {
	const result = readJsonObject(filePath);
	if (result.kind === 'valid') return result.value;
	if (result.kind === 'missing') {
		throw new Error(
			`The production ${label} ${describe(rootDir, filePath)} is missing. Run \`ecopages build\` again.`,
		);
	}
	throw new Error(
		`The production ${label} ${describe(rootDir, filePath)} is invalid or unreadable. Run \`ecopages build\` again.`,
		{ cause: result.error },
	);
}

function requireBuildId(rootDir: string, filePath: string, payload: Record<string, unknown>): string {
	if (typeof payload.buildId !== 'string' || payload.buildId.length === 0) {
		throw new Error(`${describe(rootDir, filePath)} is missing a build id. Run \`ecopages build\` again.`);
	}
	return payload.buildId;
}

function requireExisting(rootDir: string, filePath: string, label: string): void {
	if (!fileSystem.exists(filePath)) {
		throw new Error(
			`The production ${label} ${describe(rootDir, filePath)} is missing. Run \`ecopages build\` again.`,
		);
	}
}

function requireMatchingBuildId(
	rootDir: string,
	buildId: string,
	deployManifestPath: string,
	filePath: string,
	payload: Record<string, unknown>,
): void {
	if (requireBuildId(rootDir, filePath, payload) !== buildId) {
		throw new Error(
			`Production manifests disagree on the build id (${describe(rootDir, deployManifestPath)} vs ${describe(rootDir, filePath)}). Run \`ecopages build\` again.`,
		);
	}
}

function requireListedFiles(
	rootDir: string,
	values: Iterable<unknown>,
	resolvePath: (relativePath: string) => string,
	label: string,
): void {
	for (const relativePath of values) {
		if (typeof relativePath !== 'string') continue;
		requireExisting(rootDir, resolvePath(relativePath), label);
	}
}

function requireServerModules(rootDir: string, serverDir: string, buildId: string, deployManifestPath: string): void {
	const serverModulesPath = path.join(serverDir, SERVER_MODULES_MANIFEST_FILENAME);
	const serverModules = requireJsonObject(rootDir, serverModulesPath, 'server-modules map');
	requireMatchingBuildId(rootDir, buildId, deployManifestPath, serverModulesPath, serverModules);
	const modules = serverModules.modules;
	if (!modules || typeof modules !== 'object' || Array.isArray(modules)) {
		throw new Error(
			`${describe(rootDir, serverModulesPath)} is missing a modules map. Run \`ecopages build\` again.`,
		);
	}
	requireListedFiles(
		rootDir,
		Object.values(modules),
		(relativePath) => path.join(serverDir, relativePath),
		'server module',
	);
}

function requireOptionalBrowserManifest(
	rootDir: string,
	serverDir: string,
	buildId: string,
	deployManifestPath: string,
): void {
	const browserManifestPath = path.join(serverDir, BROWSER_CLIENT_MANIFEST_FILENAME);
	const browserManifestResult = readJsonObject(browserManifestPath);
	if (browserManifestResult.kind !== 'valid') return;
	const browserManifest = browserManifestResult.value;
	requireMatchingBuildId(rootDir, buildId, deployManifestPath, browserManifestPath, browserManifest);
	const browserOutputPaths = browserManifest.browserOutputPaths;
	if (Array.isArray(browserOutputPaths)) {
		requireListedFiles(
			rootDir,
			browserOutputPaths,
			(relativePath) => path.resolve(rootDir, relativePath),
			'browser output',
		);
	}
}

/**
 * Checks that `dist/` is a complete production export: one build id across its
 * manifests, and every listed output exists. It does not read sources.
 */
export function assertProductionDistComplete(rootDir: string, distDir: string): void {
	const resolvedRoot = path.resolve(rootDir);
	const resolvedDist = path.resolve(resolvedRoot, distDir);
	const serverDir = path.join(resolvedDist, SERVER_BUNDLE_DIR);
	const deployManifestPath = path.join(serverDir, 'manifest.json');
	const deployManifest = requireJsonObject(resolvedRoot, deployManifestPath, 'bundle manifest');
	const buildId = requireBuildId(resolvedRoot, deployManifestPath, deployManifest);

	if (typeof deployManifest.serverEntry !== 'string' || deployManifest.serverEntry.length === 0) {
		throw new Error(
			`${describe(resolvedRoot, deployManifestPath)} is missing a server entry. Run \`ecopages build\` again.`,
		);
	}
	requireExisting(resolvedRoot, path.join(serverDir, deployManifest.serverEntry), 'server entry');
	if (typeof deployManifest.emittedConfigModule === 'string' && deployManifest.emittedConfigModule.length > 0) {
		requireExisting(resolvedRoot, path.join(serverDir, deployManifest.emittedConfigModule), 'emitted config');
	}

	const routeListPath = path.join(serverDir, PRODUCTION_ROUTES_FILENAME);
	const routeList = requireJsonObject(resolvedRoot, routeListPath, 'route list');
	requireMatchingBuildId(resolvedRoot, buildId, deployManifestPath, routeListPath, routeList);
	requireServerModules(resolvedRoot, serverDir, buildId, deployManifestPath);
	requireOptionalBrowserManifest(resolvedRoot, serverDir, buildId, deployManifestPath);
}
