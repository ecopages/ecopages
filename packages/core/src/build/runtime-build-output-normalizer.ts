import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const corePackageRequire = createRequire(new URL('../../package.json', import.meta.url));
const appDeclaredPackageCache = new Map<string, Set<string>>();

/**
 * Core-owned packages that are part of the Node adapter's runtime surface and
 * should therefore be preserved as bare specifiers in bundled output.
 *
 * Only list packages whose bare-specifier form will be resolvable from the
 * app's Node.js runtime (i.e. they ship alongside the framework and do not
 * need to be in the app's own package.json).
 *
 * Build-time tools (e.g. oxc-parser, rolldown) deliberately omitted — their
 * imports in server-side output must be rewritten to absolute file: URLs so
 * the bundler does not embed them in app code.
 */
const CORE_RUNTIME_BARE_SPECIFIER_PACKAGES = new Set<string>(['ws']);

function tryResolveRuntimeImport(specifier: string, resolver: NodeJS.Require): string | undefined {
	try {
		return resolver.resolve(specifier);
	} catch {
		return undefined;
	}
}

function isBareRuntimeImport(specifier: string): boolean {
	return (
		!specifier.startsWith('.') &&
		!path.isAbsolute(specifier) &&
		!specifier.startsWith('/') &&
		!specifier.startsWith('node:') &&
		!specifier.startsWith('@/') &&
		!specifier.startsWith('~/') &&
		!specifier.startsWith('#') &&
		!specifier.includes(':')
	);
}

function getPackageNameFromSpecifier(specifier: string): string {
	if (specifier.startsWith('@')) {
		return specifier.split('/').slice(0, 2).join('/');
	}

	return specifier.split('/')[0] ?? specifier;
}

function getDeclaredAppPackages(rootDir: string): Set<string> {
	const cacheKey = path.resolve(rootDir);
	const cached = appDeclaredPackageCache.get(cacheKey);
	if (cached) {
		return cached;
	}

	const packageJsonPath = path.resolve(rootDir, 'package.json');
	const declaredPackages = new Set<string>();

	try {
		const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as Record<string, unknown>;
		for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'] as const) {
			const entries = packageJson[field];
			if (!entries || typeof entries !== 'object') {
				continue;
			}

			for (const packageName of Object.keys(entries as Record<string, unknown>)) {
				declaredPackages.add(packageName);
			}
		}
	} catch {
		appDeclaredPackageCache.set(cacheKey, declaredPackages);
		return declaredPackages;
	}

	appDeclaredPackageCache.set(cacheKey, declaredPackages);
	return declaredPackages;
}

export function isDeclaredAppPackageImport(specifier: string, rootDir: string): boolean {
	return getDeclaredAppPackages(rootDir).has(getPackageNameFromSpecifier(specifier));
}

/**
 * Whether the given bare specifier should be left as-is (not rewritten to a
 * file URL) in bundled output.
 *
 * Two categories qualify:
 * 1. **App-declared packages** — present in the app's own package.json; the
 *    app's resolver will find them at runtime.
 * 2. **Core runtime surface packages** — a curated subset of the framework's
 *    own dependencies that are part of its public Node adapter surface (e.g.
 *    `ws`). These ship alongside the framework and are resolvable from the
 *    bundled output's location even when the app has not declared them.
 *
 * Build-time packages declared by core (e.g. `oxc-parser`, `rolldown`) are
 * intentionally *not* included here — their imports must still be rewritten
 * to absolute `file:` URLs so they are not left as bare specifiers in app
 * output.
 */
function isDeclaredInResolutionChain(specifier: string, rootDir: string): boolean {
	const packageName = getPackageNameFromSpecifier(specifier);
	if (CORE_RUNTIME_BARE_SPECIFIER_PACKAGES.has(packageName)) {
		return true;
	}
	return isDeclaredAppPackageImport(specifier, rootDir);
}

function rewriteRuntimeImportSpecifier(specifier: string, quote: string, rootDir: string): string | undefined {
	if (!isBareRuntimeImport(specifier)) {
		return undefined;
	}

	if (isDeclaredInResolutionChain(specifier, rootDir)) {
		return undefined;
	}

	const resolvedPath = tryResolveRuntimeImport(specifier, corePackageRequire);
	if (!resolvedPath || !/\.(?:[cm]?[jt]s|tsx|jsx)$/u.test(resolvedPath)) {
		return undefined;
	}

	return `${quote}${pathToFileURL(resolvedPath).href}${quote}`;
}

function rewriteRuntimeBuildOutputImports(code: string, rootDir: string): string {
	const rewriteSpecifier = (prefix: string, quote: string, specifier: string) => {
		const rewrittenSpecifier = rewriteRuntimeImportSpecifier(specifier, quote, rootDir);
		return `${prefix}${rewrittenSpecifier ?? `${quote}${specifier}${quote}`}`;
	};

	const withResolvedPackages = code
		.replace(/(\bfrom\s+)(['"])([^'"\\]+)\2/g, (_match, prefix, quote, specifier) =>
			rewriteSpecifier(prefix, quote, specifier),
		)
		.replace(/(\bimport\s+)(['"])([^'"\\]+)\2/g, (_match, prefix, quote, specifier) =>
			rewriteSpecifier(prefix, quote, specifier),
		)
		.replace(/(\bimport\s*\(\s*)(['"])([^'"\\]+)\2/g, (_match, prefix, quote, specifier) =>
			rewriteSpecifier(prefix, quote, specifier),
		);

	return withResolvedPackages.replace(
		/(['"])(@oxc-project\/runtime\/(?:helpers(?:\/esm)?\/[^'"\\]+))\1/g,
		(match, quote, specifier) => {
			const resolvedPath = tryResolveRuntimeImport(specifier as string, corePackageRequire);
			return resolvedPath ? `${quote}${pathToFileURL(resolvedPath).href}${quote}` : match;
		},
	);
}

export function normalizeNodeRuntimeBuildOutputFile(filePath: string, rootDir: string): void {
	if (!/\.(?:[cm]?js)$/u.test(filePath)) {
		return;
	}

	const fileSystem = corePackageRequire('node:fs') as typeof import('node:fs');
	if (!fileSystem.existsSync(filePath)) {
		return;
	}

	const code = fileSystem.readFileSync(filePath, 'utf-8');
	const rewritten = rewriteRuntimeBuildOutputImports(code, rootDir);
	if (rewritten !== code) {
		fileSystem.writeFileSync(filePath, rewritten);
	}
}

export function normalizeNodeRuntimeBuildOutputs(outputPaths: string[], rootDir: string): void {
	for (const outputPath of outputPaths) {
		normalizeNodeRuntimeBuildOutputFile(outputPath, rootDir);
	}
}
