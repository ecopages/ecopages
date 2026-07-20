import path from 'node:path';
import { HmrStrategy, HmrStrategyType, type HmrAction } from '@ecopages/core/hmr/hmr-strategy';
import { isRegisteredDevTransformEntrypoint } from '@ecopages/core/hmr/hmr-entrypoint-output';
import type { HmrRegisteredEntrypointsContext } from '@ecopages/core/hmr/hmr-registered-entrypoints-context';
import { getEjsxHmrOwnership } from './ecopages-jsx-hmr-ownership.ts';

export type EcopagesJsxHmrStrategyContext = HmrRegisteredEntrypointsContext & {
	getSrcDir(): string;
	getPagesDir(): string;
	getLayoutsDir(): string;
	getIncludesDir(): string;
	getTemplateExtensions(): ReadonlyArray<string>;
};

export class EcopagesJsxHmrStrategy extends HmrStrategy {
	override readonly type = HmrStrategyType.INTEGRATION;

	private readonly context: EcopagesJsxHmrStrategyContext;

	constructor(context: EcopagesJsxHmrStrategyContext) {
		super();
		this.context = context;
	}

	override matches(filePath: string): boolean {
		const resolvedPath = path.resolve(filePath);

		if (isRegisteredDevTransformEntrypoint(this.context.getRegisteredEntrypoints(), resolvedPath)) {
			return false;
		}
		const srcDir = path.resolve(this.context.getSrcDir());

		if (!resolvedPath.startsWith(`${srcDir}${path.sep}`) && resolvedPath !== srcDir) {
			return false;
		}

		const includesDir = path.resolve(this.context.getIncludesDir());
		if (includesDir && (resolvedPath === includesDir || resolvedPath.startsWith(`${includesDir}${path.sep}`))) {
			return false;
		}

		if (this.isPageOrLayoutSource(resolvedPath)) {
			return this.hasJsxTemplateExtension(resolvedPath);
		}

		const ownership = getEjsxHmrOwnership();
		if (ownership.fileOwners.has(resolvedPath)) {
			return true;
		}

		return false;
	}

	override async process(filePath: string): Promise<HmrAction> {
		return {
			type: 'broadcast',
			events: [
				{
					type: 'layout-update',
					path: filePath,
					timestamp: Date.now(),
				},
			],
		};
	}

	private isPageOrLayoutSource(resolvedPath: string): boolean {
		const pagesDir = path.resolve(this.context.getPagesDir());
		const layoutsDir = path.resolve(this.context.getLayoutsDir());

		if (pagesDir && (resolvedPath === pagesDir || resolvedPath.startsWith(`${pagesDir}${path.sep}`))) {
			return true;
		}

		if (layoutsDir && (resolvedPath === layoutsDir || resolvedPath.startsWith(`${layoutsDir}${path.sep}`))) {
			return true;
		}

		return false;
	}

	private hasJsxTemplateExtension(resolvedPath: string): boolean {
		return this.context.getTemplateExtensions().some((extension) => resolvedPath.endsWith(extension));
	}
}
