/**
 * HMR strategy for server-rendered include templates and explicit server views.
 *
 * These files affect SSR output (head, layout shell, explicit views) but are not
 * client HMR entrypoints. Broadcast a layout-update so the active navigation
 * runtime can refresh the current page without a full document reload.
 */

import { HmrStrategy, HmrStrategyType, type HmrAction } from '../hmr-strategy.ts';

/** Outranks integration-owned strategies that may also match shared dependencies. */
const SERVER_RENDERED_TEMPLATE_PRIORITY_OFFSET = 50;
import type { DevelopmentInvalidationService } from '../../services/invalidation/development-invalidation.service.ts';

export class ServerRenderedTemplateHmrStrategy extends HmrStrategy {
	readonly type = HmrStrategyType.INTEGRATION;
	readonly priorityOffset = SERVER_RENDERED_TEMPLATE_PRIORITY_OFFSET;

	constructor(private readonly invalidationService: DevelopmentInvalidationService) {
		super();
	}

	matches(filePath: string): boolean {
		return (
			this.invalidationService.isIncludeSourceFile(filePath) ||
			this.invalidationService.isExplicitServerViewFile(filePath)
		);
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
