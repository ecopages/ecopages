import { compileMdxFunctionBody } from '@ecopages/mdx/core';
import { statSync } from 'node:fs';
import type { EcoComponent } from '@ecopages/core';
import { Fragment, jsx, jsxs } from '@ecopages/jsx/jsx-runtime';
import { getDocsMdxCompileOptions } from './mdx-plugin-chain';

export type CompiledDocsMdx = {
	default: EcoComponent;
};

export async function compileDocsMdx(options: { source: string; filePath: string }): Promise<CompiledDocsMdx> {
	const { source, filePath } = options;
	const mod = await compileMdxFunctionBody({
		source,
		filePath,
		compilerOptions: getDocsMdxCompileOptions(),
		runScope: { Fragment, jsx, jsxs },
	});

	statSync(filePath);

	return {
		default: mod.default as EcoComponent,
	};
}
