import { getComponentRenderContext } from '@ecopages/core/route-renderer/orchestration/foreign-child/component-render-context';

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

	throw new Error(
		`[ecopages] MDX content entry "${sourceFile}" is owned by the "${integration}" integration but was rendered inside a ${context.currentIntegration} render tree. MDX entries compiled by "${integration}" can only be rendered through routes owned by "${integration}" (for example a [...slug].${integration}.tsx catch-all). Either render this entry from an owning route or compile it with the host integration's MDX loader.`,
	);
}
