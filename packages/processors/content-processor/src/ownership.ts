import {
	getComponentRenderContext,
	type ForeignChildInterceptionResult,
} from '@ecopages/core/route-renderer/orchestration/foreign-child/component-render-context';
import type { EcoComponent } from '@ecopages/core';

/**
 * Throws when an MDX content entry is invoked under a different integration
 * than the one that compiled it.
 *
 * @remarks
 * Call this before invoking the entry component. Checking after render misses
 * async components and lets an incompatible renderer throw first. No-ops when
 * no render context is active so loaders and tests can call the component
 * outside a render lane.
 */
export function assertContentEntryOwnerLane(sourceFile: string, integration: string | undefined): void {
	if (!integration) {
		return;
	}

	const context = getComponentRenderContext();
	if (!context || context.currentIntegration === integration) {
		return;
	}

	throw ownershipError(sourceFile, integration, context.currentIntegration);
}

function ownershipError(sourceFile: string, integration: string, currentIntegration: string): Error {
	return new Error(
		`[ecopages] MDX content entry "${sourceFile}" is owned by the "${integration}" integration and cannot be rendered inside a ${currentIntegration} render tree. Embed it through its owning renderer (for example eco.embed() / EcoEmbed) or render it from a route owned by "${integration}".`,
	);
}

type OwnedContentEntryComponent = EcoComponent & ((props: Record<string, unknown>) => unknown);

function isPromiseLike<T>(value: unknown): value is PromiseLike<T> {
	return typeof value === 'object' && value !== null && 'then' in value && typeof value.then === 'function';
}

/**
 * Invokes an MDX content entry under its owning integration's lane.
 *
 * @remarks
 * When a foreign render lane is active but exposes a foreign-child runtime,
 * the entry is handed off to its owning renderer through the Foreign Subtree
 * queue instead of failing: the owning renderer renders and hydrates the
 * subtree, and the lane receives resolved HTML. The strict ownership guard
 * applies only when no handoff is available, so loaders and tests can invoke
 * the component outside a render lane and foreign lanes without a runtime
 * fail fast with an actionable message.
 */
export function invokeContentEntry(
	sourceFile: string,
	integration: string | undefined,
	component: OwnedContentEntryComponent,
	page: (props: Record<string, unknown>) => unknown,
	props: Record<string, unknown> = {},
): unknown {
	if (!integration) {
		return page(props);
	}

	const context = getComponentRenderContext();
	if (!context || context.currentIntegration === integration) {
		return page(props);
	}

	const resolveInterception = (interception: ForeignChildInterceptionResult): unknown => {
		if (interception?.kind === 'resolved') {
			return interception.value;
		}
		if (interception?.kind === 'inline') {
			return page(interception.props ?? props);
		}

		throw ownershipError(sourceFile, integration, context.currentIntegration);
	};

	const interception = context.interceptForeignChild({
		component,
		props,
		targetIntegration: integration,
	});
	return isPromiseLike<ForeignChildInterceptionResult>(interception)
		? interception.then(resolveInterception)
		: resolveInterception(interception);
}
