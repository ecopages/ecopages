import { afterEach, describe, expect, it } from 'vitest';
import { loadNavigationGlobalScripts } from './global-scripts.ts';

type Probe = { ranGlobals?: string[] };

const probe = globalThis as Probe;

function parse(head: string): Document {
	return new DOMParser().parseFromString(`<html><head>${head}</head><body></body></html>`, 'text/html');
}

function moduleScript(attributes: string, body: string): string {
	return `<script type="module" ${attributes} src="data:text/javascript,${encodeURIComponent(body)}"></script>`;
}

describe('loadNavigationGlobalScripts', () => {
	afterEach(() => {
		delete probe.ranGlobals;
		document.head.replaceChildren();
	});

	it('runs the global scripts of the incoming document and leaves its Component scripts for the head commit', async () => {
		const incoming = parse(
			`${moduleScript('data-eco-global-script data-eco-script-id="first"', '(globalThis.ranGlobals ??= []).push("first")')}
			${moduleScript('data-eco-global-script data-eco-script-id="second"', '(globalThis.ranGlobals ??= []).push("second")')}
			${moduleScript('data-eco-script-id="component"', '(globalThis.ranGlobals ??= []).push("component")')}`,
		);

		await expect(loadNavigationGlobalScripts(incoming)).resolves.toBe(true);

		expect(probe.ranGlobals).toEqual(['first', 'second']);
		expect(document.head.querySelector('script[data-eco-script-id="component"]')).toBeNull();
	});

	it('does not insert a global script the live head already holds', async () => {
		const live = document.createElement('script');
		live.setAttribute('data-eco-script-id', 'first');
		document.head.appendChild(live);
		const incoming = parse(
			moduleScript(
				'data-eco-global-script data-eco-script-id="first"',
				'(globalThis.ranGlobals ??= []).push("again")',
			),
		);

		await expect(loadNavigationGlobalScripts(incoming)).resolves.toBe(true);

		expect(probe.ranGlobals).toBeUndefined();
		expect(document.head.querySelectorAll('script[data-eco-script-id="first"]')).toHaveLength(1);
	});

	it('makes a second navigation wait for a global script that is still loading', async () => {
		const incoming = parse(
			moduleScript(
				'data-eco-global-script data-eco-script-id="first"',
				'(globalThis.ranGlobals ??= []).push("waited")',
			),
		);

		const first = loadNavigationGlobalScripts(incoming);
		await expect(loadNavigationGlobalScripts(incoming)).resolves.toBe(true);

		expect(probe.ranGlobals).toEqual(['waited']);
		await first;
		expect(document.head.querySelectorAll('script[data-eco-script-id="first"]')).toHaveLength(1);
	});

	it('reports a global script that fails to load', async () => {
		const incoming = parse(
			'<script type="module" data-eco-global-script data-eco-script-id="missing" src="/__missing-global-script.js"></script>',
		);

		await expect(loadNavigationGlobalScripts(incoming)).resolves.toBe(false);

		expect(document.head.querySelector('script[data-eco-script-id="missing"]')).toBeNull();
		await expect(loadNavigationGlobalScripts(incoming)).resolves.toBe(false);
	});
});
