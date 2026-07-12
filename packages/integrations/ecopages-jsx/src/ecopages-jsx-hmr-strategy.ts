/**
 * HMR strategy for JSX integration-owned SSR source modules.
 *
 * @remarks
 * Edits to files that produce SSR HTML (page sources, layout sources, components
 * that the active render tree depends on) need a soft page refetch so the
 * browser picks up the new markup. Plain `update` events re-import modules on
 * the client but leave the server-rendered DOM stale.
 *
 * The strategy matches a file when any of these hold:
 * - the file lives under `pagesDir` or `layoutsDir` and has a JSX `templatesExt`
 * - the file appears in the active render tree's component dependency graph
 *
 * It defers registered HMR entrypoints to {@link JsHmrStrategy} so script-only
 * edits keep their existing `update`-then-hot-accept path. It also defers
 * include templates and explicit server views to {@link ServerRenderedTemplateHmrStrategy}
 * by returning `false` for those paths.
 */

import path from 'node:path';
import { HmrStrategy, HmrStrategyType, type HmrAction } from '@ecopages/core/hmr/hmr-strategy';
import { getEjsxHmrOwnership } from './ecopages-jsx-hmr-ownership.ts';

export interface EcopagesJsxHmrStrategyContext {
	getWatchedFiles(): Map<string, string>;
	getSrcDir(): string;
	getPagesDir(): string;
	getLayoutsDir(): string;
	getIncludesDir(): string;
	getTemplateExtensions(): ReadonlyArray<string>;
}

export class EcopagesJsxHmrStrategy extends HmrStrategy {
	override readonly type = HmrStrategyType.INTEGRATION;

	private readonly context: EcopagesJsxHmrStrategyContext;

	constructor(context: EcopagesJsxHmrStrategyContext) {
		super();
		this.context = context;
	}

	override matches(filePath: string): boolean {
		const resolvedPath = path.resolve(filePath);
		const watchedFiles = this.context.getWatchedFiles();

		if (
			watchedFiles.has(resolvedPath) ||
			[...watchedFiles.keys()].some((key) => path.resolve(key) === resolvedPath)
		) {
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
