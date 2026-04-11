import { describe, expect, it } from 'vitest';
import { ECO_DOCUMENT_OWNER_ATTRIBUTE } from '@ecopages/core/router/navigation-coordinator';
import {
	defaultDocumentElementAttributesToSync,
	syncDocumentElementAttributes,
} from '../src/client/document-element-sync.ts';

function parseDocument(html: string): Document {
	return new DOMParser().parseFromString(html, 'text/html');
}

function resetDocumentElement(): void {
	document.documentElement.removeAttribute('lang');
	document.documentElement.removeAttribute('dir');
	document.documentElement.removeAttribute(ECO_DOCUMENT_OWNER_ATTRIBUTE);
	document.documentElement.removeAttribute('data-theme');
	document.documentElement.className = '';
}

describe('document-element-sync', () => {
	it('exposes the default document-owned html attributes', () => {
		expect(defaultDocumentElementAttributesToSync).toEqual(['lang', 'dir', ECO_DOCUMENT_OWNER_ATTRIBUTE]);
	});

	it('updates changed synced attributes from the incoming document', () => {
		resetDocumentElement();
		document.documentElement.setAttribute('lang', 'en');
		document.documentElement.setAttribute('dir', 'ltr');
		document.documentElement.setAttribute(ECO_DOCUMENT_OWNER_ATTRIBUTE, 'browser-router');

		const newDocument = parseDocument(
			`<html lang="fr" dir="rtl" ${ECO_DOCUMENT_OWNER_ATTRIBUTE}="react-router"><head></head><body></body></html>`,
		);

		syncDocumentElementAttributes(document, newDocument, defaultDocumentElementAttributesToSync);

		expect(document.documentElement.getAttribute('lang')).toBe('fr');
		expect(document.documentElement.getAttribute('dir')).toBe('rtl');
		expect(document.documentElement.getAttribute(ECO_DOCUMENT_OWNER_ATTRIBUTE)).toBe('react-router');
	});

	it('removes synced attributes that are absent from the incoming document', () => {
		resetDocumentElement();
		document.documentElement.setAttribute('lang', 'en');
		document.documentElement.setAttribute('dir', 'ltr');
		document.documentElement.setAttribute(ECO_DOCUMENT_OWNER_ATTRIBUTE, 'browser-router');

		const newDocument = parseDocument('<html lang="fr"><head></head><body></body></html>');

		syncDocumentElementAttributes(document, newDocument, defaultDocumentElementAttributesToSync);

		expect(document.documentElement.getAttribute('lang')).toBe('fr');
		expect(document.documentElement.hasAttribute('dir')).toBe(false);
		expect(document.documentElement.hasAttribute(ECO_DOCUMENT_OWNER_ATTRIBUTE)).toBe(false);
	});

	it('preserves client-managed attributes that are not in the sync list', () => {
		resetDocumentElement();
		document.documentElement.setAttribute('data-theme', 'dark');
		document.documentElement.classList.add('dark');

		const newDocument = parseDocument(
			'<html lang="fr" dir="rtl" data-theme="light" class="light"><head></head><body></body></html>',
		);

		syncDocumentElementAttributes(document, newDocument, defaultDocumentElementAttributesToSync);

		expect(document.documentElement.getAttribute('lang')).toBe('fr');
		expect(document.documentElement.getAttribute('dir')).toBe('rtl');
		expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
		expect(document.documentElement.className).toBe('dark');
	});
});
