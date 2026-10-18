import { describe, expect, it } from 'vitest';
import { findIntegrationForFile } from './find-integration-for-file.ts';

describe('findIntegrationForFile', () => {
	const jsx = { name: 'jsx', extensions: ['.tsx'] };
	const kita = { name: 'kita', extensions: ['.kita.tsx'] };
	const html = { name: 'html', extensions: ['.html'] };
	const integrations = [jsx, kita, html];

	it('picks the longest extension the path ends with, regardless of registration order', () => {
		expect(findIntegrationForFile(integrations, '/app/src/pages/about.kita.tsx')).toBe(kita);
		expect(findIntegrationForFile([kita, jsx], '/app/src/pages/about.kita.tsx')).toBe(kita);
		expect(findIntegrationForFile(integrations, '/app/src/pages/about.tsx')).toBe(jsx);
	});

	it('keeps dotted file names with the owner of their final extension', () => {
		expect(findIntegrationForFile(integrations, '/app/src/pages/my.page.tsx')).toBe(jsx);
		expect(findIntegrationForFile(integrations, '/app/src/pages/v1.2.html')).toBe(html);
	});

	it('returns undefined when no Integration owns the extension', () => {
		expect(findIntegrationForFile(integrations, '/app/src/pages/about.md')).toBeUndefined();
	});
});
