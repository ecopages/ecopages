import { parseNavigationDocument } from '@ecopages/core/router/navigation-pipeline';
import { morphBody } from './body-morpher.ts';

/** Applies browser-router's DOM body swap. Core owns document navigation work. */
export class DomSwapper {
	private persistAttribute: string;

	constructor(persistAttribute: string) {
		this.persistAttribute = persistAttribute;
	}

	parseHTML(html: string, url?: URL): Document {
		return parseNavigationDocument(html, url ?? new URL(window.location.href));
	}

	morphBody(newDocument: Document): void {
		morphBody(newDocument, this.persistAttribute);
	}
}
