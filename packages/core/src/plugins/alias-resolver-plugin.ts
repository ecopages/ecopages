import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { EcoBuildPlugin } from '../build/build-types.ts';

const RESOLVABLE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mdx', '.css', '.scss', '.sass', '.less'];

function findResolvablePath(candidate: string): string | undefined {
	if (path.extname(candidate)) {
		if (existsSync(candidate)) {
			return candidate;
		}
	}

	for (const extension of RESOLVABLE_EXTENSIONS) {
		const fileCandidate = `${candidate}${extension}`;
		if (existsSync(fileCandidate)) {
			return fileCandidate;
		}
	}

	for (const extension of RESOLVABLE_EXTENSIONS) {
		const indexCandidate = path.join(candidate, `index${extension}`);
		if (existsSync(indexCandidate)) {
			return indexCandidate;
		}
	}

	return undefined;
}

function resolveAliasedBarrelTarget(resolvedPath: string): string {
	if (!path.basename(resolvedPath).startsWith('index.')) {
		return resolvedPath;
	}

	const source = readFileSync(resolvedPath, 'utf8').trim();
	const match = source.match(/^export\s+\*\s+from\s+['"]([^'"]+)['"]\s*;?$/);

	if (!match?.[1]?.startsWith('.')) {
		return resolvedPath;
	}

	const target = findResolvablePath(path.resolve(path.dirname(resolvedPath), match[1]));
	return target ?? resolvedPath;
}

export function resolveAppSourceAliasPath(srcDir: string, specifier: string): string | undefined {
	if (!specifier.startsWith('@/')) {
		return undefined;
	}

	const candidate = path.join(srcDir, specifier.slice(2));
	const resolved = findResolvablePath(candidate);
	return resolved ? resolveAliasedBarrelTarget(resolved) : undefined;
}

export function createAliasResolverPlugin(srcDir: string): EcoBuildPlugin {
	return {
		name: 'ecopages-alias-resolver',
		setup(build) {
			build.onResolve({ filter: /^@\// }, (args) => {
				const resolved = resolveAppSourceAliasPath(srcDir, args.path);

				if (resolved) {
					return { path: resolved };
				}

				return {};
			});
		},
	};
}
