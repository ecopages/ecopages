import { beforeEach, describe, expect, it } from 'vitest';
import { clearNavigationHtmlCache, getEcoNavigationRuntime } from '@ecopages/core/client';
import { createRouter } from '../src/client/eco-router';
import { htmlFetchResponse, installEcoRouterTestHooks, type EcoRouterTestFixtures } from './eco-router.harness';

type Marked = HTMLElement & { marker?: string };

function page(note: string): string {
	return `<p id="note">${note}</p><x-reload-probe id="probe"><button>0</button></x-reload-probe>`;
}

describe('EcoRouter reload state preservation', () => {
	const fixtures: EcoRouterTestFixtures = {
		router: null,
		fetchSpy: null,
	};

	installEcoRouterTestHooks(fixtures);

	beforeEach(() => {
		clearNavigationHtmlCache();
		document.body.innerHTML = page('v1');
		(document.querySelector('#probe') as Marked).marker = 'kept';
		fixtures.fetchSpy?.mockImplementation(async () =>
			htmlFetchResponse(`<html><head></head><body>${page('v2')}</body></html>`),
		);
	});

	async function reload(): Promise<void> {
		expect(await getEcoNavigationRuntime(window).reloadCurrentPage({ clearCache: true })).toBe(true);
		expect(document.querySelector('#note')?.textContent).toBe('v2');
	}

	it('records no server markup unless development asks for it, so a reload replaces custom elements', async () => {
		fixtures.router = createRouter({ prefetch: false });

		await reload();

		expect((document.querySelector('#probe') as Marked).marker).toBeUndefined();
	});

	it('keeps unchanged custom elements once development HMR enables reload state preservation', async () => {
		getEcoNavigationRuntime(window).enableReloadStatePreservation();
		fixtures.router = createRouter({ prefetch: false });

		await reload();

		expect((document.querySelector('#probe') as Marked).marker).toBe('kept');
	});

	it('starts preserving state when development enables it after the router started', async () => {
		fixtures.router = createRouter({ prefetch: false });
		getEcoNavigationRuntime(window).enableReloadStatePreservation();

		await reload();

		expect((document.querySelector('#probe') as Marked).marker).toBe('kept');
	});
});
