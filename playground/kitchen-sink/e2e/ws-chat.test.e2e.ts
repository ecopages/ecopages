import { expect, test, type TestInfo } from '@playwright/test';
import { gotoAndWait, trackRuntimeErrors } from './helpers';

const CONNECT_TIMEOUT = 8000;

function wsChatPath(testInfo: TestInfo, room?: string): string {
	const roomId = room ?? `e2e-w${testInfo.workerIndex}-${testInfo.testId.replace(/[^\w-]/g, '-')}`;
	return `/ws-chat?room=${encodeURIComponent(roomId)}`;
}

test.describe('Kitchen Sink WS Chat Lab', () => {
	test('page renders the chat UI correctly', async ({ page }, testInfo) => {
		const runtime = trackRuntimeErrors(page);

		await gotoAndWait(page, wsChatPath(testInfo));

		await expect(page.getByRole('heading', { name: /Mini Chat/ })).toBeVisible();
		await expect(page.locator('[data-chat-messages]')).toBeVisible();
		await expect(page.locator('[data-chat-form]')).toBeVisible();
		await expect(page.locator('[data-chat-input]')).toBeVisible();
		await expect(page.locator('[data-chat-send]')).toBeVisible();
		await expect(page.locator('[data-chat-status]')).toBeVisible();

		runtime.assertClean();
	});

	test('WebSocket connects and status transitions to connected', async ({ page }, testInfo) => {
		await gotoAndWait(page, wsChatPath(testInfo));

		await expect
			.poll(
				async () => {
					const status = await page.locator('[data-chat-status]').textContent();
					return status?.trim().toLowerCase();
				},
				{ timeout: CONNECT_TIMEOUT, intervals: [200, 400, 600] },
			)
			.toBe('connected');

		await expect(page.locator('[data-chat-status-dot]')).toHaveAttribute('data-chat-status-dot', 'connected');
	});

	test('seed messages are visible in the message list after connect', async ({ page }, testInfo) => {
		await gotoAndWait(page, wsChatPath(testInfo, 'lobby'));

		await page.waitForFunction(
			() => document.querySelector('[data-chat-status]')?.textContent?.trim().toLowerCase() === 'connected',
			null,
			{ timeout: CONNECT_TIMEOUT },
		);

		await expect(page.locator('[data-chat-messages] [data-message-id]').first()).toBeVisible();

		await expect
			.poll(
				async () => {
					const texts = await page.locator('[data-chat-messages] .chat-lab__message-text').allTextContents();
					return texts.some((t: string) => t.includes('Welcome to the WS Chat lab'));
				},
				{ timeout: 6000 },
			)
			.toBe(true);

		const allTexts = await page.locator('[data-chat-messages] .chat-lab__message-text').allTextContents();
		expect(allTexts.some((t: string) => t.includes('WebSocket injection API'))).toBe(true);
	});

	test('sends a message and sees it appear in the list', async ({ page }, testInfo) => {
		await gotoAndWait(page, wsChatPath(testInfo));

		await page.waitForFunction(
			() => document.querySelector('[data-chat-status]')?.textContent?.trim().toLowerCase() === 'connected',
			null,
			{ timeout: CONNECT_TIMEOUT },
		);

		const uniqueText = `hello-${Date.now()}`;
		await page.locator('[data-chat-input]').fill(uniqueText);
		await page.locator('[data-chat-send]').click();

		await expect
			.poll(
				async () => {
					const texts = await page.locator('[data-chat-messages] .chat-lab__message-text').allTextContents();
					return texts.some((t) => t.includes(uniqueText));
				},
				{ timeout: 6000, intervals: [200, 400, 600] },
			)
			.toBe(true);
	});

	test('input is cleared after sending', async ({ page }, testInfo) => {
		await gotoAndWait(page, wsChatPath(testInfo));

		await page.waitForFunction(
			() => document.querySelector('[data-chat-status]')?.textContent?.trim().toLowerCase() === 'connected',
			null,
			{ timeout: CONNECT_TIMEOUT },
		);

		await page.locator('[data-chat-input]').fill('clearing test');
		await page.locator('[data-chat-send]').click();

		await expect(page.locator('[data-chat-input]')).toHaveValue('');
	});

	test('updates username and sends message under the new username', async ({ page }, testInfo) => {
		await gotoAndWait(page, wsChatPath(testInfo));

		await page.waitForFunction(
			() => document.querySelector('[data-chat-status]')?.textContent?.trim().toLowerCase() === 'connected',
			null,
			{ timeout: CONNECT_TIMEOUT },
		);

		await page.locator('[data-chat-username]').fill('cool-tester');
		await page.locator('[data-chat-username]').blur();

		await page.waitForFunction(
			() => document.querySelector('[data-chat-status]')?.textContent?.trim().toLowerCase() === 'connected',
			null,
			{ timeout: CONNECT_TIMEOUT },
		);

		const text = `test-message-${Date.now()}`;
		await page.locator('[data-chat-input]').fill(text);
		await page.locator('[data-chat-send]').click();

		await expect
			.poll(
				async () => {
					const messages = await page.locator('[data-chat-messages] .chat-lab__message').all();
					for (const msg of messages) {
						const msgText = await msg.locator('.chat-lab__message-text').textContent();
						if (msgText?.includes(text)) {
							const user = await msg.locator('.chat-lab__message-user').textContent();
							return user?.trim();
						}
					}
					return null;
				},
				{ timeout: 6000, intervals: [200, 400, 600] },
			)
			.toBe('cool-tester');
	});

	test('message sent in one tab is broadcast to a second tab', async ({ browser }, testInfo) => {
		const roomPath = wsChatPath(testInfo, `e2e-broadcast-w${testInfo.workerIndex}`);
		const ctxA = await browser.newContext();
		const ctxB = await browser.newContext();
		const pageA = await ctxA.newPage();
		const pageB = await ctxB.newPage();

		try {
			await gotoAndWait(pageA, roomPath);
			await gotoAndWait(pageB, roomPath);

			await Promise.all([
				pageA.waitForFunction(
					() =>
						document.querySelector('[data-chat-status]')?.textContent?.trim().toLowerCase() === 'connected',
					null,
					{ timeout: CONNECT_TIMEOUT },
				),
				pageB.waitForFunction(
					() =>
						document.querySelector('[data-chat-status]')?.textContent?.trim().toLowerCase() === 'connected',
					null,
					{ timeout: CONNECT_TIMEOUT },
				),
			]);

			const broadcastText = `broadcast-${Date.now()}`;
			await pageA.locator('[data-chat-input]').fill(broadcastText);
			await pageA.locator('[data-chat-send]').click();

			await expect
				.poll(
					async () => {
						const texts = await pageB
							.locator('[data-chat-messages] .chat-lab__message-text')
							.allTextContents();
						return texts.some((t) => t.includes(broadcastText));
					},
					{ timeout: 8000, intervals: [200, 400, 600] },
				)
				.toBe(true);
		} finally {
			await ctxA.close();
			await ctxB.close();
		}
	});
});
