/**
 * JavaScript HMR Strategy
 *
 * Handles hot module replacement for JavaScript and TypeScript entrypoints.
 * Invalidates dev-transform modules and decides whether the browser can hot-accept
 * the change or must reload.
 *
 * @module
 */

import path from 'node:path';
import { HmrStrategy, HmrStrategyType, type HmrAction } from '../hmr-strategy.ts';
import { appLogger } from '../../global/app-logger.ts';
import { isRegisteredDevTransformEntrypoint, isRegisteredScriptEntrypoint } from '../hmr-entrypoint-output.ts';
import { isDevTransformModuleUrl } from '../hmr-asset-paths.ts';
import type { HmrRegisteredEntrypointsContext } from '../hmr-registered-entrypoints-context.ts';
import type { EntrypointDependencyGraph } from '../../services/runtime-state/entrypoint-dependency-graph.service.ts';

/**
 * Context interface providing access to HmrManager state.
 * Required for JsHmrStrategy to access registered entrypoints and configuration.
 */
export interface JsHmrContext extends HmrRegisteredEntrypointsContext {
	getWatchedFiles(): Map<string, string>;

	getEntrypointDependencyGraph(): EntrypointDependencyGraph;

	getSrcDir(): string;

	getPagesDir(): string;

	getLayoutsDir(): string;

	getTemplateExtensions(): string[];

	/**
	 * @remarks
	 * Integrations with higher-priority HMR strategies can use this to keep the
	 * generic JS strategy from overwriting their emitted entrypoints when a shared
	 * dependency changes.
	 */
	shouldProcessEntrypoint?(entrypointPath: string): boolean;

	invalidateDevTransformSource?(sourcePath: string): void;

	consumeRegisteredScriptReloadRequired?(filePath: string): boolean;
}

/**
 * Strategy for handling JavaScript/TypeScript file changes with hot reloading.
 */
export class JsHmrStrategy extends HmrStrategy {
	readonly type = HmrStrategyType.SCRIPT;
	private context: JsHmrContext;

	constructor(context: JsHmrContext) {
		super();
		this.context = context;
	}

	matches(filePath: string): boolean {
		const watchedFiles = this.context.getWatchedFiles();
		const resolvedPath = path.resolve(filePath);
		const isJsTs = /\.(ts|tsx|js|jsx)$/.test(resolvedPath);
		const srcDir = path.resolve(this.context.getSrcDir());
		const isInSrc = resolvedPath.startsWith(`${srcDir}${path.sep}`) || resolvedPath === srcDir;
		const isIntegrationTemplate = this.context
			.getTemplateExtensions()
			.some((extension) => resolvedPath.endsWith(extension));

		if (watchedFiles.size === 0) {
			return false;
		}

		if (!isJsTs || !isInSrc) {
			return false;
		}

		if (watchedFiles.has(resolvedPath)) {
			return true;
		}

		if (isIntegrationTemplate) {
			return false;
		}

		return true;
	}

	async process(filePath: string): Promise<HmrAction> {
		appLogger.debug(`[JsHmrStrategy] Processing ${filePath}`);
		const watchedFiles = this.context.getWatchedFiles();
		const resolvedChanged = path.resolve(filePath);
		const registeredEntrypoints = this.context.getRegisteredEntrypoints();
		const isRegisteredEntrypointEdit = isRegisteredDevTransformEntrypoint(registeredEntrypoints, resolvedChanged);

		if (watchedFiles.size === 0) {
			appLogger.debug(`[JsHmrStrategy] No watched files to rebuild`);
			return { type: 'none' };
		}

		const dependencyHits = this.context.getEntrypointDependencyGraph().getDependencyEntrypoints(filePath);
		const hasDependencyHit = dependencyHits.size > 0;
		const impactedEntrypoints = isRegisteredEntrypointEdit
			? [resolvedChanged]
			: hasDependencyHit
				? Array.from(dependencyHits).filter((entrypoint) => watchedFiles.has(path.resolve(entrypoint)))
				: Array.from(watchedFiles.keys());
		const buildableEntrypoints = impactedEntrypoints.filter(
			(entrypoint) => this.context.shouldProcessEntrypoint?.(entrypoint) ?? true,
		);

		if (!hasDependencyHit && !isRegisteredEntrypointEdit) {
			appLogger.debug('[JsHmrStrategy] Dependency graph miss, rebuilding all watched entrypoints');
		}

		if (buildableEntrypoints.length === 0) {
			return { type: 'none' };
		}

		const devTransformUpdates: string[] = [];
		let devTransformReloadRequired = false;

		for (const entrypoint of buildableEntrypoints) {
			const resolvedEntrypoint = path.resolve(entrypoint);
			const outputUrl = watchedFiles.get(resolvedEntrypoint);

			if (!outputUrl || !isDevTransformModuleUrl(outputUrl)) {
				appLogger.debug(
					`[JsHmrStrategy] Skipping non-dev-transform entrypoint ${resolvedEntrypoint}: ${outputUrl ?? 'unregistered'}`,
				);
				continue;
			}

			this.context.invalidateDevTransformSource?.(resolvedEntrypoint);
			if (isRegisteredScriptEntrypoint(registeredEntrypoints, resolvedEntrypoint)) {
				if (this.context.consumeRegisteredScriptReloadRequired?.(resolvedEntrypoint)) {
					devTransformReloadRequired = true;
				} else {
					devTransformUpdates.push(outputUrl);
				}
			} else {
				devTransformUpdates.push(outputUrl);
			}
		}

		if (devTransformReloadRequired) {
			appLogger.debug(`[JsHmrStrategy] Full reload required (no HMR accept found)`);
			return {
				type: 'broadcast',
				events: [{ type: 'reload' }],
			};
		}

		if (devTransformUpdates.length > 0) {
			return {
				type: 'broadcast',
				events: devTransformUpdates.map((p) => ({
					type: 'update',
					path: p,
					timestamp: Date.now(),
				})),
			};
		}

		return { type: 'none' };
	}
}
