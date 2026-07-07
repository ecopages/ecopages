import { afterEach, describe, expect, it, vi } from 'vitest';
import { isNonExecutableHeadScript } from './classification.ts';
import {
	collectRerunScripts,
	createRerunScriptUrl,
	flushPendingRerunScripts,
	resetRerunNonceForTests,
} from './rerun-queue.ts';
import { RERUN_SRC_ATTR } from './registry.ts';

describe('isNonExecutableHeadScript', () => {
	it('treats JSON-LD scripts as non-executable', () => {
		const script = document.createElement('script');
		script.type = 'application/ld+json';
		expect(isNonExecutableHeadScript(script)).toBe(true);
	});

	it('treats untyped scripts as executable', () => {
		const script = document.createElement('script');
		expect(isNonExecutableHeadScript(script)).toBe(false);
	});
});

describe('collectRerunScripts and flushPendingRerunScripts', () => {
	afterEach(() => {
		document.head.replaceChildren();
		document.body.replaceChildren();
		resetRerunNonceForTests();
	});

	it('replays registered rerun callbacks without duplicating script tags', () => {
		const callback = vi.fn();
		(window as Window & { __ECO_PAGES__?: { rerunScripts?: Record<string, () => void> } }).__ECO_PAGES__ = {
			rerunScripts: { 'eco-test': callback },
		};

		try {
			flushPendingRerunScripts([
				{
					parent: 'head',
					attributes: [
						['data-eco-rerun', ''],
						['data-eco-script-id', 'eco-test'],
					],
					textContent: '',
					src: null,
					scriptId: 'eco-test',
				},
			]);

			expect(callback).toHaveBeenCalledOnce();
			expect(document.head.querySelector('script[data-eco-script-id="eco-test"]')).toBeNull();
		} finally {
			delete (window as Window & { __ECO_PAGES__?: unknown }).__ECO_PAGES__;
		}
	});

	it('cache-busts external module rerun scripts', () => {
		const html = '<html><head><script data-eco-rerun src="/app.js" type="module"></script></head></html>';
		const parsed = new DOMParser().parseFromString(html, 'text/html');
		const scripts = collectRerunScripts(parsed);

		flushPendingRerunScripts(scripts);

		const inserted = document.head.querySelector(`script[${RERUN_SRC_ATTR}]`);
		expect(inserted?.getAttribute('src')).toMatch(/__eco_rerun=1/);
		expect(inserted?.getAttribute(RERUN_SRC_ATTR)).toBe('/app.js');
	});

	it('appends a unique nonce on each module rerun url', () => {
		const first = createRerunScriptUrl('/app.js');
		const second = createRerunScriptUrl('/app.js');
		expect(first).not.toBe(second);
	});
});
