import { describe, expect, it } from 'vitest';
import {
	injectEcopagesDocumentDevBootstrap,
	injectEcopagesHmrRuntimeIntoHtml,
	stripViteBrowserHmrScripts,
} from './ecopages-hmr-runtime-injection.ts';

describe('stripViteBrowserHmrScripts', () => {
	it('removes Vite browser HMR client scripts', () => {
		const html = `<html><head><script type="module" src="/@vite/client"></script><script type="module" src="/@react-refresh"></script></head><body></body></html>`;

		const result = stripViteBrowserHmrScripts(html);

		expect(result).not.toContain('/@vite/client');
		expect(result).not.toContain('/@react-refresh');
	});
});

describe('injectEcopagesHmrRuntimeIntoHtml', () => {
	it('adds the Ecopages HMR runtime import', () => {
		const html = `<html><head></head><body></body></html>`;

		const result = injectEcopagesHmrRuntimeIntoHtml(html);

		expect(result).toContain("import '/_hmr_runtime.js'");
	});
});

describe('injectEcopagesDocumentDevBootstrap', () => {
	it('adds the HMR runtime import without a reload guard', () => {
		const html = `<html><head><script type="module" src="/@vite/client"></script></head><body></body></html>`;

		const result = injectEcopagesDocumentDevBootstrap(html);

		expect(result).toContain("import '/_hmr_runtime.js'");
		expect(result).not.toContain('__ECOPAGES_HOST_OWNS_RELOAD__');
		expect(result).not.toContain('ecopagesGuardHostReload');
	});
});
