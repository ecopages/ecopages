import { beforeEach, describe, expect, it } from 'vitest';
import { clearNavigationHtmlCache } from '@ecopages/core/client';
import { createRouter } from '../src/client/eco-router';
import { htmlFetchResponse, installEcoRouterTestHooks, type EcoRouterTestFixtures } from './eco-router.harness';

describe('EcoRouter fresh navigation', () => {
	const fixtures: EcoRouterTestFixtures = {
		router: null,
		fetchSpy: null,
	};

	installEcoRouterTestHooks(fixtures);

	beforeEach(() => {
		clearNavigationHtmlCache();
	});

	function serveVersionedPages(): void {
		const visits = new Map<string, number>();
		fixtures.fetchSpy?.mockImplementation(async (input: string | URL | Request) => {
			const path = new URL(input instanceof Request ? input.url : input.toString(), window.location.href)
				.pathname;
			const visit = (visits.get(path) ?? 0) + 1;
			visits.set(path, visit);
			return htmlFetchResponse(
				`<html><head></head><body><div id="content">${path} visit ${visit}</div></body></html>`,
			);
		});
	}

	it('fetches every visit fresh when prefetch is disabled', async () => {
		serveVersionedPages();
		fixtures.router = createRouter({ prefetch: false });

		await fixtures.router.navigate('/fresh-a');
		expect(document.body.innerHTML).toContain('/fresh-a visit 1');
		await fixtures.router.navigate('/fresh-b');
		expect(document.body.innerHTML).toContain('/fresh-b visit 1');
		await fixtures.router.navigate('/fresh-a');

		expect(document.body.innerHTML).toContain('/fresh-a visit 2');
		expect(document.body.innerHTML).not.toContain('/fresh-a visit 1');
	});
});
