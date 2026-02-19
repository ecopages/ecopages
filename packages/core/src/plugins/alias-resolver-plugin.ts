import { existsSync } from 'node:fs';
import path from 'node:path';
import type { EcoBuildPlugin } from '../build/build-types.ts';

const RESOLVABLE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mdx', '.css', '.scss', '.sass', '.less'];

function findResolvablePath(candidate: string): string | undefined {
	if (path.extname(candidate)) {
		return existsSync(candidate) ? candidate : undefined;
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

export function createAliasResolverPlugin(srcDir: string): EcoBuildPlugin {
	return {
		name: 'ecopages-alias-resolver',
		setup(build) {
			build.onResolve({ filter: /^@\// }, (args) => {
				const candidate = path.join(srcDir, args.path.slice(2));
				const resolved = findResolvablePath(candidate);

				if (resolved) {
					return { path: resolved };
				}

				return {};
			});
		},
	};
}
