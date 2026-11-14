/**
 * HMR strategy for server-rendered include templates and explicit server views.
 *
 * An explicit view is a file the server entry imports as a View Reference, wherever it lives. These files affect
 * SSR output (head, layout shell, explicit views) but are not
 * client HMR entrypoints. Broadcast a layout-update so the active navigation
 * runtime can refresh the current page without a full document reload.
 */

import { HmrStrategy, HmrStrategyType, type HmrAction } from '../hmr-strategy.ts';
import { isViewReferencePath } from '../../build/server/view-reference.ts';
import type { DevelopmentInvalidationService } from '../../dev/invalidation/development-invalidation.service.ts';

/** Outranks integration-owned strategies that may also match shared dependencies. */
const SERVER_RENDERED_TEMPLATE_PRIORITY_OFFSET = 50;

export class ServerRenderedTemplateHmrStrategy extends HmrStrategy {
	override readonly type = HmrStrategyType.INTEGRATION;
	override readonly priorityOffset = SERVER_RENDERED_TEMPLATE_PRIORITY_OFFSET;

	constructor(private readonly invalidationService: DevelopmentInvalidationService) {
		super();
	}

	matches(filePath: string): boolean {
		return this.invalidationService.isIncludeSourceFile(filePath) || isViewReferencePath(filePath);
	}

	async process(filePath: string): Promise<HmrAction> {
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
}
