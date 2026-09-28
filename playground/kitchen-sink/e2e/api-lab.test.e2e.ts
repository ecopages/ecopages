import { expect, test } from '@playwright/test';
import type { Page } from 'playwright-core';
import { getPageTestId } from '../src/data/primary-links';
import { gotoPathSimple, recoverToPath, trackRuntimeErrors } from './test-support';

function apiLabLocators(page: Page) {
	return {
		viewer: page.locator('[data-api-response-viewer]'),
		status: page.locator('[data-response-status]'),
		body: page.locator('[data-response-body]'),
		command: (label: string) => page.locator(`[data-api-command="true"][data-label="${label}"]`),
	};
}

async function waitForApiLabMounted(page: Page) {
	await expect(apiLabLocators(page).viewer).toHaveAttribute('data-api-lab-runtime', 'mounted');
}

async function runApiCommand(page: Page, label: string, expectedStatusFragment: string) {
	const { viewer, status, command } = apiLabLocators(page);

	await expect(viewer).toHaveAttribute('data-api-lab-runtime', 'mounted');
	await command(label).click();
	await expect(status).toContainText(expectedStatusFragment);
}

test.describe('API handlers @content', () => {
	test('rebinds the API lab browser script after navigation and still executes host API commands', async ({
		page,
	}) => {
		const runtime = trackRuntimeErrors(page);
		const { status, body } = apiLabLocators(page);

		await gotoPathSimple(page, '/api-lab');
		await expect(page.getByTestId(getPageTestId('/api-lab'))).toBeVisible();
		await waitForApiLabMounted(page);

		await runApiCommand(page, 'Ping with locals', '200');
		await expect(body).toContainText('"ok": true');
		await expect(body).toContainText('featureFlags');

		await runApiCommand(page, 'Echo payload', '201');
		await expect(body).toContainText('hello kitchen sink');

		await gotoPathSimple(page, '/integration-matrix');
		await expect(page.getByTestId(getPageTestId('/integration-matrix'))).toBeVisible();

		await recoverToPath(page, '/api-lab');
		await expect(page.getByTestId(getPageTestId('/api-lab'))).toBeVisible();
		await waitForApiLabMounted(page);
		await expect(status).toContainText('Ready');
		await expect(body).toContainText('Click Run to execute the selected command.');

		await runApiCommand(page, 'Admin list', '200');
		await expect(body).toContainText('Semantic shells are active');

		await runApiCommand(page, 'Admin create', '201');
		await expect(body).toContainText('Fresh deploy');
		runtime.assertClean();
	});

	test('exposes the same host API paths via direct requests', async ({ request }) => {
		const pingResponse = await request.get('/api/v1/ping');
		expect(pingResponse.ok()).toBe(true);
		const pingJson = await pingResponse.json();
		expect(pingJson).toMatchObject({
			ok: true,
			role: 'viewer',
		});

		const echoResponse = await request.post('/api/v1/echo', {
			headers: { 'content-type': 'application/json' },
			data: { message: 'direct echo', source: 'playwright' },
		});
		expect(echoResponse.status()).toBe(201);
		const echoJson = await echoResponse.json();
		expect(echoJson).toMatchObject({
			received: { message: 'direct echo', source: 'playwright' },
		});

		const catalogResponse = await request.get('/api/v1/catalog/semantic-html');
		expect(catalogResponse.ok()).toBe(true);
		const catalogJson = await catalogResponse.json();
		expect(catalogJson).toMatchObject({
			pattern: { slug: 'semantic-html', title: 'Semantic html shell discovery' },
		});

		const uniqueTitle = `Playwright announcement ${Date.now()}`;
		const adminCreateResponse = await request.post('/api/v1/admin/announcements', {
			headers: {
				'content-type': 'application/json',
				'x-kitchen-role': 'admin',
			},
			data: {
				title: uniqueTitle,
				message: 'Created from the kitchen sink e2e suite.',
			},
		});
		expect(adminCreateResponse.status()).toBe(201);
		const adminCreateJson = await adminCreateResponse.json();
		expect(adminCreateJson).toMatchObject({
			title: uniqueTitle,
			createdBy: 'admin',
		});
	});
});
