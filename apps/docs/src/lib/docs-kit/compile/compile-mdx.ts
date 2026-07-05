import { compileMdxFunctionBody } from '@ecopages/mdx/core';
import { statSync } from 'node:fs';
import type { MDXComponents } from 'mdx/types.js';
import { Fragment, jsx, jsxs } from '@ecopages/jsx/jsx-runtime';
import type { CompiledDocsMdx, DocsMdxComponentProps } from './compile-mdx.types';
import { getDocsMdxCompileOptions } from './mdx-plugin-chain';
import { prependMdxImageImports } from './inject-mdx-image-imports';
import { getEcopagesImagesVirtualModuleUrl, getDocsMdxComponents, loadDocsMdxImageExports } from './mdx-scope';

type CompileCacheEntry = {
	mtimeMs: number;
	module: CompiledDocsMdx;
};

const compileCache = new Map<string, CompileCacheEntry>();

/**
 * Compiles docs MDX with the shared `@ecopages/mdx` function-body runtime.
 *
 * @remarks Component scope is injected through `props.components` at render time
 * so content files remain free of per-page imports.
 */
export async function compileDocsMdx(options: { source: string; filePath: string }): Promise<CompiledDocsMdx> {
	const { source, filePath } = options;
	const mtimeMs = statSync(filePath).mtimeMs;
	const cached = compileCache.get(filePath);

	if (cached && cached.mtimeMs === mtimeMs) {
		return cached.module;
	}

	const images = await loadDocsMdxImageExports();
	const compileSource = prependMdxImageImports(source, images, getEcopagesImagesVirtualModuleUrl());
	const components = {
		...getDocsMdxComponents(),
		...images,
	} as MDXComponents;
	const mod = await compileMdxFunctionBody({
		source: compileSource,
		filePath,
		compilerOptions: getDocsMdxCompileOptions(),
		runScope: { Fragment, jsx, jsxs },
	});
	const module: CompiledDocsMdx = {
		default: (props: DocsMdxComponentProps = {}) => {
			const result = mod.default({
				...props,
				components: {
					...components,
					...props.components,
				},
			});

			return result as Awaited<ReturnType<CompiledDocsMdx['default']>>;
		},
	};

	compileCache.set(filePath, { mtimeMs, module });
	return module;
}

/** Clears compile cache entries (for tests). */
export function clearCompileDocsMdxCache(): void {
	compileCache.clear();
}

export type { CompiledDocsMdx, DocsMdxComponent, DocsMdxComponentProps } from './compile-mdx.types';
