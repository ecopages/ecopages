import { expect, test } from '@playwright/test';
import type { Page } from 'playwright-core';
import { getPageTestId } from '../src/data/primary-links';
import { gotoPath, recoverToPath, trackRuntimeErrors } from './test-support';

async function readInPage<T>(page: Page, reader: () => T): Promise<T | null> {
	try {
		return await page.evaluate(reader);
	} catch {
		return null;
	}
}

async function expectResponseStatus(page: Page, fragment: string, timeout = 15_000) {
	await expect
		.poll(
			async () => {
				const status = await readInPage(
					page,
					() => document.querySelector('[data-response-status]')?.textContent ?? '',
				);
				return status?.includes(fragment) ?? false;
			},
			{ timeout },
		)
		.toBe(true);
}

async function expectResponseBody(page: Page, fragment: string, timeout = 15_000) {
	await expect
		.poll(
			async () => {
				const body = await readInPage(
					page,
					() => document.querySelector('[data-response-body]')?.textContent ?? '',
				);
				return body?.includes(fragment) ?? false;
			},
			{ timeout },
		)
		.toBe(true);
}

async function waitForApiLabMounted(page: Page) {
	await expect
		.poll(
			async () => {
				const runtime = await readInPage(
					page,
					() =>
						document.querySelector('[data-api-response-viewer]')?.getAttribute('data-api-lab-runtime') ??
						'',
				);
				return runtime === 'mounted';
			},
			{ timeout: 15_000 },
		)
		.toBe(true);
}

async function runApiCommand(page: Page, label: string, expectedStatusFragment: string, timeout = 30_000) {
	const deadline = Date.now() + timeout;

	while (Date.now() < deadline) {
		await waitForApiLabMounted(page);
		await page.evaluate((commandLabel) => {
			document
				.querySelector<HTMLButtonElement>(`[data-api-command="true"][data-label="${commandLabel}"]`)
				?.click();
		}, label);

		const matched = await expect
			.poll(
				async () => {
					const status = await readInPage(
						page,
						() => document.querySelector('[data-response-status]')?.textContent ?? '',
					);
					return status?.includes(expectedStatusFragment) ?? false;
				},
				{ timeout: Math.max(5_000, deadline - Date.now()) },
			)
			.toBe(true)
			.then(() => true)
			.catch(() => false);

		if (matched) {
			return;
		}
	}

	throw new Error(`API lab command "${label}" did not reach status containing "${expectedStatusFragment}"`);
}

test.describe('API handlers @content', () => {
	test('rebinds the API lab browser script after navigation and still executes host API commands', async ({
		page,
	}) => {
		test.setTimeout(120_000);
		const runtime = trackRuntimeErrors(page);

		await gotoPath(page, '/api-lab');
		await expect(page.getByTestId(getPageTestId('/api-lab'))).toBeVisible({ timeout: 15_000 });
		await waitForApiLabMounted(page);

		await runApiCommand(page, 'Ping with locals', '200');
		await expectResponseBody(page, '"ok": true');
		await expectResponseBody(page, 'featureFlags');

		await runApiCommand(page, 'Echo payload', '201');
		await expectResponseBody(page, 'hello kitchen sink');

		await gotoPath(page, '/integration-matrix');
		await expect(page.getByTestId(getPageTestId('/integration-matrix'))).toBeVisible();

		await recoverToPath(page, '/api-lab');
		await expect(page.getByTestId(getPageTestId('/api-lab'))).toBeVisible({ timeout: 15_000 });
		await waitForApiLabMounted(page);
		await expectResponseStatus(page, 'Ready');
		await expectResponseBody(page, 'Click Run to execute the selected command.');

		await runApiCommand(page, 'Admin list', '200');
		await expectResponseBody(page, 'Semantic shells are active');

		await runApiCommand(page, 'Admin create', '201', 45_000);
		await expectResponseBody(page, 'Fresh deploy', 15_000);
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
