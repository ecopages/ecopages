import type { PendingRerunScript } from '@ecopages/core/client/navigation-scripts';
import { morphBody, replaceBody } from './body-morpher.ts';
import {
	flushHeadScripts,
	flushRerunScripts as flushPendingRerunScripts,
	morphHead,
	type PendingHeadScript,
} from './head-updater.ts';
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
	 * Replays queued scripts after the body swap completes.
	 *
	 * @remarks
	 * Scripts are intentionally flushed after the new body is in place so DOM-
	 * dependent bootstraps bind against the incoming page rather than the page
	 * being replaced.
	 */
	flushRerunScripts(): void {
		flushHeadScripts(this.pendingHeadScripts);
		this.pendingHeadScripts = [];

		flushPendingRerunScripts(this.pendingRerunScripts);
		this.pendingRerunScripts = [];
	}

	morphBody(newDocument: Document): void {
		morphBody(newDocument, this.persistAttribute);
	}

	replaceBody(newDocument: Document): void {
		replaceBody(newDocument, this.persistAttribute);
	}
}
