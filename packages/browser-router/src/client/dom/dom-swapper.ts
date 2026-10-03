import { toRerunScriptActivation, type PendingRerunScript } from '@ecopages/core/client/navigation-scripts';
import { morphBody, replaceBody } from './body-morpher.ts';
import { activateScriptsInOrder, collectBodyScripts, type ScriptActivation } from './script-activation.ts';
import { morphHead, toHeadScriptActivations, type PendingHeadScript } from './head-updater.ts';
import { parseHTML } from './html-parser.ts';
import { preloadStylesheets } from './stylesheet-preloader.ts';

/**
 * Handles DOM manipulation during client-side page transitions.
 *
 * @remarks
 * Uses a hybrid approach inspired by Turbo:
 * - Surgical head updates (no morphing) to prevent FOUC
 * - Idiomorph for efficient body diffing
 */
export class DomSwapper {
	private persistAttribute: string;
	private pendingHeadScripts: PendingHeadScript[] = [];
	private pendingRerunScripts: PendingRerunScript[] = [];
	private pendingBodyScripts: ScriptActivation[] = [];
	private scriptGeneration = 0;

	constructor(persistAttribute: string) {
		this.persistAttribute = persistAttribute;
	}

	parseHTML(html: string, url?: URL): Document {
		return parseHTML(html, url);
	}

	async preloadStylesheets(newDocument: Document): Promise<void> {
		return preloadStylesheets(newDocument);
	}

	morphHead(newDocument: Document): { bodyStrategy: 'morph' | 'replace' } {
		const result = morphHead(newDocument, this.persistAttribute);
		this.pendingHeadScripts = result.pendingHeadScripts;
		this.pendingRerunScripts = result.pendingRerunScripts;
		return { bodyStrategy: result.bodyStrategy };
	}

	/**
	 * Runs the scripts the swap queued: new head scripts, then `data-eco-rerun` scripts, then body
	 * scripts, as one sequence in that order.
	 *
	 * @remarks
	 * Scripts run after the new body is in place, so DOM-dependent bootstraps bind against the
	 * incoming page rather than the page being replaced. {@link activateScriptsInOrder} inserts
	 * everything up to the first script still loading before this returns. The next call stops
	 * the previous sequence where it waits, so a slow script from one page never lets that page's
	 * later scripts run in the next one.
	 */
	flushScripts(): void {
		const activations = [
			...toHeadScriptActivations(this.pendingHeadScripts),
			...this.pendingRerunScripts.map(toRerunScriptActivation),
			...this.pendingBodyScripts,
		];
		this.pendingHeadScripts = [];
		this.pendingRerunScripts = [];
		this.pendingBodyScripts = [];
		const generation = ++this.scriptGeneration;
		void activateScriptsInOrder(activations, () => generation !== this.scriptGeneration);
	}

	morphBody(newDocument: Document): void {
		morphBody(newDocument, this.persistAttribute);
		this.pendingBodyScripts = collectBodyScripts(this.persistAttribute);
	}

	replaceBody(newDocument: Document): void {
		replaceBody(newDocument, this.persistAttribute);
		this.pendingBodyScripts = collectBodyScripts(this.persistAttribute);
	}
}
