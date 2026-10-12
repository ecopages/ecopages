import type { EcoNavigationDirection } from './navigation-coordinator.ts';
import { completeNavigationLifecycle, dispatchBeforeSwap } from './navigation-lifecycle.ts';
import {
	activatePreparedNavigationScripts,
	prepareNavigationHead,
	type NavigationHeadUpdate,
} from './navigation-head.ts';
import { runNavigationViewTransition } from './navigation-view-transition.ts';
import { ECO_PERSIST_ATTRIBUTE } from '../../client/navigation-attributes.ts';

export type NavigationCommitPipelineResult = 'committed' | 'stale' | 'reload-requested';

export type NavigationCommitPipelineInput = {
	url: URL;
	direction: EcoNavigationDirection;
	newDocument: Document;
	isStale: () => boolean;
	viewTransitionsEnabled: boolean;
	persistAttribute?: string;
	includeBodyScripts?: boolean;
	skipScriptActivation?: (script: HTMLScriptElement) => boolean;
	onReloadRequested?: () => void | Promise<void>;
	beforeTransition?: () => void | Promise<void>;
	beforeCommit?: () => void;
	swap: (headUpdate: NavigationHeadUpdate) => void | boolean | Promise<void | boolean>;
	onSwapped?: () => void | Promise<void>;
	afterSwap?: () => void | Promise<void>;
	afterLifecycle?: () => void | Promise<void>;
};

/** Runs shared document work around the router-specific page swap. */
export async function commitNavigationPage(
	input: NavigationCommitPipelineInput,
): Promise<NavigationCommitPipelineResult> {
	let headUpdate: NavigationHeadUpdate | null = null;
	try {
		const { requestedReload } = dispatchBeforeSwap(document, {
			url: input.url,
			direction: input.direction,
			newDocument: input.newDocument,
		});
		if (input.isStale()) return 'stale';
		if (requestedReload) {
			await input.onReloadRequested?.();
			return input.isStale() ? 'stale' : 'reload-requested';
		}

		const preparedHeadUpdate = await prepareNavigationHead(
			input.newDocument,
			input.persistAttribute ?? ECO_PERSIST_ATTRIBUTE,
			input.skipScriptActivation,
		);
		headUpdate = preparedHeadUpdate;
		if (input.isStale()) return 'stale';
		await input.beforeTransition?.();
		if (input.isStale()) return 'stale';

		let committed = false;
		await runNavigationViewTransition(
			async () => {
				if (input.isStale()) return;
				input.beforeCommit?.();
				if (input.isStale()) return;
				preparedHeadUpdate.commit();
				const swapped = await input.swap(preparedHeadUpdate);
				if (swapped === false || input.isStale()) return;
				await input.onSwapped?.();
				if (input.isStale()) return;
				activatePreparedNavigationScripts(
					preparedHeadUpdate,
					input.persistAttribute ?? ECO_PERSIST_ATTRIBUTE,
					input.isStale,
					input.includeBodyScripts ?? true,
				);
				await input.afterSwap?.();
				if (input.isStale()) return;
				committed = true;
			},
			{ enabled: input.viewTransitionsEnabled, incomingDocument: input.newDocument },
		);
		if (input.isStale() || !committed) return 'stale';

		completeNavigationLifecycle(
			document,
			{ url: input.url, direction: input.direction },
			{ isStale: input.isStale },
		);
		await input.afterLifecycle?.();
		return input.isStale() ? 'stale' : 'committed';
	} finally {
		headUpdate?.cancel();
	}
}
