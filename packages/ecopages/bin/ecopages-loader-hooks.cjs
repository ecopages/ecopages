/**
 * Ecopages Node.js loader hooks.
 *
 * Registered via --require before the thin-host entry point so every subsequent
 * import() of a TypeScript source file is transparently transformed by esbuild.
 *
 * This replaces the previous "bundle-to-disk-then-import" bootstrap pipeline
 * with a single-file transform that lets Node load .ts/.tsx files directly.
 */

'use strict';

const { registerHooks } = require('node:module');
const { transformSync } = require('esbuild');
const { readFileSync, existsSync, statSync, realpathSync } = require('node:fs');
const nodePath = require('node:path');

const TS_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts']);
const RESOLVE_TRY_EXTENSIONS = ['.ts', '.tsx', '/index.ts', '/index.tsx'];
const KNOWN_EXTENSIONS = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts', '.json', '.node']);

function tryResolveWithExtensions(basePath) {
	try {
		if (existsSync(basePath) && !statSync(basePath).isDirectory()) {
			return basePath;
		}
	} catch {
		/* ignore stat failures */
	}

	for (const ext of RESOLVE_TRY_EXTENSIONS) {
		const candidate = basePath + ext;
		if (existsSync(candidate)) {
			return candidate;
		}
	}

	return null;
}

const tsconfigPathsCache = new Map();

function findProjectRoot(startDir) {
	let dir = startDir;
	try {
		dir = realpathSync(dir);
	} catch {
		/* use original */
	}
	while (dir !== nodePath.dirname(dir)) {
		if (existsSync(nodePath.join(dir, 'tsconfig.json'))) {
			return dir;
		}
		dir = nodePath.dirname(dir);
	}
	return null;
}

function getTsconfigPaths(projectRoot) {
	if (tsconfigPathsCache.has(projectRoot)) return tsconfigPathsCache.get(projectRoot);

	const tsconfigPath = nodePath.join(projectRoot, 'tsconfig.json');
	try {
		const raw = readFileSync(tsconfigPath, 'utf8');
		const stripped = raw.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
		const parsed = JSON.parse(stripped);
		const paths = parsed.compilerOptions?.paths ?? {};
		const baseUrl = parsed.compilerOptions?.baseUrl ?? '.';
		const resolvedBaseUrl = nodePath.resolve(projectRoot, baseUrl);
		const result = { paths, baseUrl: resolvedBaseUrl };
		tsconfigPathsCache.set(projectRoot, result);
		return result;
	} catch {
		tsconfigPathsCache.set(projectRoot, null);
		return null;
	}
}

function resolvePathAlias(specifier, parentDir) {
	const projectRoot = findProjectRoot(parentDir);
	if (!projectRoot) return null;

	const config = getTsconfigPaths(projectRoot);
	if (!config) return null;

	for (const [pattern, targets] of Object.entries(config.paths)) {
		const prefix = pattern.replace(/\*$/, '');
		if (!specifier.startsWith(prefix)) continue;
		const rest = specifier.slice(prefix.length);
		for (const target of targets) {
			const targetPrefix = target.replace(/\*$/, '');
			const candidate = nodePath.resolve(config.baseUrl, targetPrefix + rest);
			const found = tryResolveWithExtensions(candidate);
			if (found) return found;
		}
	}

	return null;
}

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (!context.parentURL || !context.parentURL.startsWith('file://')) {
			return nextResolve(specifier, context);
		}

		if (!specifier.startsWith('.')) {
			const parentPath = new URL(context.parentURL).pathname;
			const parentDir = nodePath.dirname(parentPath);
			const aliasResolved = resolvePathAlias(specifier, parentDir);
			if (aliasResolved) {
				return { url: 'file://' + aliasResolved, format: 'module', shortCircuit: true };
			}
			return nextResolve(specifier, context);
		}

		const parentPath = new URL(context.parentURL).pathname;
		const parentDir = nodePath.dirname(parentPath);

		if (!KNOWN_EXTENSIONS.has(nodePath.extname(specifier))) {
			const basePath = nodePath.resolve(parentDir, specifier);
			const found = tryResolveWithExtensions(basePath);
			if (found) {
				return { url: 'file://' + found, format: 'module', shortCircuit: true };
			}
		}

		if (specifier.endsWith('.js')) {
			const resolved = nodePath.resolve(parentDir, specifier);
			if (!existsSync(resolved)) {
				for (const ext of ['.ts', '.tsx']) {
					const candidate = resolved.slice(0, -3) + ext;
					if (existsSync(candidate)) {
						return { url: 'file://' + candidate, format: 'module', shortCircuit: true };
					}
				}
			}
		}

		return nextResolve(specifier, context);
	},

	load(url, context, nextLoad) {
		if (!url.startsWith('file://')) {
			return nextLoad(url, context);
		}

		const parsed = new URL(url);
		const filePath = parsed.pathname;
		const ext = nodePath.extname(filePath);

		if (!TS_EXTENSIONS.has(ext)) {
			return nextLoad(url, context);
		}

		const source = readFileSync(filePath, 'utf8');
		const loader = ext === '.tsx' ? 'tsx' : 'ts';

		const result = transformSync(source, {
			loader,
			format: 'esm',
			target: 'es2022',
			jsx: 'automatic',
			sourcefile: filePath,
			tsconfigRaw: JSON.stringify({
				compilerOptions: {
					experimentalDecorators: true,
					useDefineForClassFields: false,
				},
			}),
		});

		return { format: 'module', source: result.code, shortCircuit: true };
	},
});
