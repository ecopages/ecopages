import { describe, expect, it } from 'vitest';
import { injectEcopagesHmrRuntimeIntoHtml } from './ecopages-hmr-runtime-injection.ts';

describe('injectEcopagesHmrRuntimeIntoHtml', () => {
	it('adds the Ecopages HMR runtime import', () => {
		const html = `<html><head></head><body></body></html>`;

		const result = injectEcopagesHmrRuntimeIntoHtml(html);

		expect(result).toContain("import '/_hmr_runtime.js'");
	});
});
