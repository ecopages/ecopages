import path from 'node:path';
import type { HmrAction } from '@ecopages/core/hmr/hmr-strategy';
import type { ReactHmrBuildTarget } from './react-hmr-dev-transform-plugins.ts';

export type HmrProcessContext = {
	resolvedFilePath: string;
	watchedFiles: Map<string, string>;
	isLayoutFile: (filePath: string) => boolean;
	isPageEntrypoint: (filePath: string) => boolean;
	isReactEntrypoint: (filePath: string) => boolean;
	ownsWatchedEntrypoint: (filePath: string) => boolean;
	isDevTransformOutputUrl: (outputUrl: string) => boolean;
	collectReactPageBuildTargets: () => Promise<ReactHmrBuildTarget[]>;
	hasLayoutOwnedDependencyTarget: (
		changedFilePath: string,
		requestedTargets: ReactHmrBuildTarget[],
	) => Promise<boolean>;
	resolveBuildTargets: (
		requestedTargets: ReactHmrBuildTarget[],
		changedFilePath: string,
	) => Promise<ReactHmrBuildTarget[]>;
	partitionBuildTargets: (
		requestedTargets: ReactHmrBuildTarget[],
		groupedPageTargets: ReactHmrBuildTarget[],
	) => { pageTargets: ReactHmrBuildTarget[]; nonPageTargets: ReactHmrBuildTarget[] };
	queueDevTransformOutputUpdates: (
		targets: readonly ReactHmrBuildTarget[],
		requestedOutputUrls: ReadonlySet<string>,
		updates: string[],
	) => void;
	markOwnedEntrypoint: (filePath: string) => void;
	getDependencyEntrypoints: (filePath: string) => Set<string>;
};

export type DependencyScanResult = {
	affectedEntrypoints: Map<string, string>;
	hasOwnedLayoutDependencyHit: boolean;
	shouldAbort: boolean;
};

export function scanDependencyHits(ctx: HmrProcessContext, changedEntrypointOutput?: string): DependencyScanResult {
	const dependencyHits = ctx.getDependencyEntrypoints(ctx.resolvedFilePath);
	const affectedEntrypoints = new Map<string, string>();
	let hasOwnedLayoutDependencyHit = false;

	if (dependencyHits.size === 0 || changedEntrypointOutput) {
		return { affectedEntrypoints, hasOwnedLayoutDependencyHit, shouldAbort: false };
	}

	for (const entrypoint of dependencyHits) {
		const resolvedEntrypoint = path.resolve(entrypoint);
		const outputUrl = ctx.watchedFiles.get(resolvedEntrypoint);
		if (outputUrl && (ctx.ownsWatchedEntrypoint(resolvedEntrypoint) || ctx.isDevTransformOutputUrl(outputUrl))) {
			affectedEntrypoints.set(resolvedEntrypoint, outputUrl);
			continue;
		}

		if (ctx.isLayoutFile(resolvedEntrypoint) && ctx.ownsWatchedEntrypoint(resolvedEntrypoint)) {
			hasOwnedLayoutDependencyHit = true;
		}
	}

	const shouldAbort =
		affectedEntrypoints.size === 0 && !hasOwnedLayoutDependencyHit && !ctx.isLayoutFile(ctx.resolvedFilePath);

	return { affectedEntrypoints, hasOwnedLayoutDependencyHit, shouldAbort };
}

export async function resolveRequestedTargets(
	ctx: HmrProcessContext,
	changedEntrypointOutput: string | undefined,
	isLayout: boolean,
	isChangedPageEntrypoint: boolean,
	hasOwnedLayoutDependencyHit: boolean,
	affectedEntrypoints: Map<string, string>,
	hasDependencyHits: boolean,
): Promise<{ requestedTargets: ReactHmrBuildTarget[]; hasLayoutOwnedRequestedTarget: boolean }> {
	let layoutOwnedPageTargets: ReactHmrBuildTarget[] = [];
	let hasLayoutOwnedRequestedTarget = false;

	if (changedEntrypointOutput && !isLayout && !isChangedPageEntrypoint) {
		layoutOwnedPageTargets = await ctx.collectReactPageBuildTargets();
		hasLayoutOwnedRequestedTarget = await ctx.hasLayoutOwnedDependencyTarget(
			ctx.resolvedFilePath,
			layoutOwnedPageTargets,
		);
	}

	const requestedTargets = changedEntrypointOutput
		? hasLayoutOwnedRequestedTarget
			? [{ entrypointPath: ctx.resolvedFilePath, outputUrl: changedEntrypointOutput }, ...layoutOwnedPageTargets]
			: [{ entrypointPath: ctx.resolvedFilePath, outputUrl: changedEntrypointOutput }]
		: hasOwnedLayoutDependencyHit
			? await ctx.collectReactPageBuildTargets()
			: hasDependencyHits
				? Array.from(affectedEntrypoints, ([entrypointPath, outputUrl]) => ({ entrypointPath, outputUrl }))
				: Array.from(ctx.watchedFiles, ([entrypointPath, outputUrl]) => ({ entrypointPath, outputUrl }));

	return { requestedTargets, hasLayoutOwnedRequestedTarget };
}

export function collectHmrUpdateUrls(
	ctx: HmrProcessContext,
	requestedTargets: ReactHmrBuildTarget[],
	pageTargets: ReactHmrBuildTarget[],
	nonPageTargets: ReactHmrBuildTarget[],
): string[] {
	const updates: string[] = [];
	const requestedOutputUrls = new Set(requestedTargets.map((target) => target.outputUrl));
	ctx.queueDevTransformOutputUpdates(pageTargets, requestedOutputUrls, updates);

	for (const { outputUrl } of nonPageTargets) {
		if (!requestedOutputUrls.has(outputUrl)) {
			continue;
		}
		if (ctx.isDevTransformOutputUrl(outputUrl)) {
			updates.push(outputUrl);
		}
	}

	return updates;
}

export function buildHmrAction(requiresLayoutRefresh: boolean, updates: string[]): HmrAction {
	if (requiresLayoutRefresh) {
		return {
			type: 'broadcast',
			events: [{ type: 'layout-update' }],
		};
	}

	if (updates.length > 0) {
		return {
			type: 'broadcast',
			events: updates.map((path) => ({
				type: 'update',
				path,
				timestamp: Date.now(),
			})),
		};
	}

	return { type: 'none' };
}

export function ensureWatchedEntrypointOwnership(
	ctx: HmrProcessContext,
	changedEntrypointOutput: string | undefined,
): 'continue' | 'abort' {
	if (!changedEntrypointOutput || ctx.ownsWatchedEntrypoint(ctx.resolvedFilePath)) {
		return 'continue';
	}
	if (ctx.isReactEntrypoint(ctx.resolvedFilePath)) {
		ctx.markOwnedEntrypoint(ctx.resolvedFilePath);
		return 'continue';
	}
	return 'abort';
}
