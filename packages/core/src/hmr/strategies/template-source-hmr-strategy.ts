/**
 * HMR strategy for files with an integration template extension, such as Kita, Lit or MDX pages, layouts and
 * components, that no integration or script strategy claims.
 *
 * Such a file only shapes server-rendered markup, so a `layout-update` lets the active navigation runtime
 * refresh the current page in place. Without a navigation runtime the client reloads the document.
 */

import { HmrStrategy, HmrStrategyType, type HmrAction } from '../hmr-strategy.ts';
import { isRegisteredScriptEntrypoint } from '../hmr-entrypoint-output.ts';
import type { HmrRegisteredEntrypointsContext } from '../hmr-registered-entrypoints-context.ts';
import type { DevelopmentInvalidationService } from '../../dev/invalidation/development-invalidation.service.ts';

/**
 * @remarks
 * Ranks below every integration and script strategy, so a template an integration owns (a React page) or the
 * browser loads as a module (a served Lit component) keeps that strategy's update. A registered script
 * entrypoint is never claimed: an in-place refresh keeps a head module script with the same URL, so the changed
 * script would not run again.
 */
export class TemplateSourceHmrStrategy extends HmrStrategy {
	override readonly type = HmrStrategyType.FALLBACK;

	constructor(
		private readonly invalidationService: DevelopmentInvalidationService,
		private readonly context: HmrRegisteredEntrypointsContext,
	) {
		super();
	}

	matches(filePath: string): boolean {
		return (
			this.invalidationService.isTemplateSourceFile(filePath) &&
			!isRegisteredScriptEntrypoint(this.context.getRegisteredEntrypoints(), filePath)
		);
	}

	async process(filePath: string): Promise<HmrAction> {
		return {
			type: 'broadcast',
			events: [{ type: 'layout-update', path: filePath, timestamp: Date.now() }],
		};
	}
}
