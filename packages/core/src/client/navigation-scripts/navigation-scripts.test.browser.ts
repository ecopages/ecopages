import { afterEach, describe, expect, it, vi } from 'vitest';
import { isNonExecutableHeadScript } from './classification.ts';
import { activateScriptsInOrder } from './activation.ts';
import { collectRerunScripts, resetRerunNonceForTests, toRerunScriptActivation } from './rerun-queue.ts';
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

describe('collectRerunScripts and script activations', () => {
	afterEach(() => {
		document.head.replaceChildren();
		document.body.replaceChildren();
		resetRerunNonceForTests();
	});

	it('replays registered rerun callbacks without duplicating script tags', async () => {
		const callback = vi.fn();
		(window as Window & { __ECO_PAGES__?: { rerunScripts?: Record<string, () => void> } }).__ECO_PAGES__ = {
			rerunScripts: { 'eco-test': callback },
		};

		try {
			const incoming = new DOMParser().parseFromString(
				'<html><head><script data-eco-rerun data-eco-script-id="eco-test"></script></head><body></body></html>',
				'text/html',
			);
			await activateScriptsInOrder(collectRerunScripts(incoming).map(toRerunScriptActivation));

			expect(callback).toHaveBeenCalledOnce();
			expect(document.head.querySelector('script[data-eco-script-id="eco-test"]')).toBeNull();
		} finally {
			delete (window as Window & { __ECO_PAGES__?: unknown }).__ECO_PAGES__;
		}
	});

	it('cache-busts external module rerun scripts', async () => {
		const html = '<html><head><script data-eco-rerun src="/app.js" type="module"></script></head></html>';
		const parsed = new DOMParser().parseFromString(html, 'text/html');
		const scripts = collectRerunScripts(parsed);

		await activateScriptsInOrder(scripts.map(toRerunScriptActivation));

		const inserted = document.head.querySelector(`script[${RERUN_SRC_ATTR}]`);
		expect(inserted?.getAttribute('src')).toMatch(/__eco_rerun=1/);
		expect(inserted?.getAttribute(RERUN_SRC_ATTR)).toBe('/app.js');
	});

	it('appends a unique nonce on each module rerun url', () => {
		const incoming = new DOMParser().parseFromString(
			'<html><head><script data-eco-rerun src="/app.js" type="module"></script></head></html>',
			'text/html',
		);
		const [script] = collectRerunScripts(incoming);
		const first = toRerunScriptActivation(script!).attributes;
		const second = toRerunScriptActivation(script!).attributes;
		expect(Array.from(first).find(([name]) => name === 'src')?.[1]).not.toBe(
			Array.from(second).find(([name]) => name === 'src')?.[1],
		);
	});
});
