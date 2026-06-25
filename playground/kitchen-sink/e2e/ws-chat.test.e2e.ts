import { expect, test, type TestInfo } from '@playwright/test';
import type { Page } from 'playwright-core';
import { getPageTestId } from '../src/data/primary-links';
import { gotoPath, trackRuntimeErrors, waitForNavigationIdle } from './test-support';

const CONNECT_TIMEOUT = 30_000;

function wsChatPath(testInfo: TestInfo, room?: string): string {
	const roomId = room ?? `e2e-w${testInfo.workerIndex}-${testInfo.testId.replace(/[^\w-]/g, '-')}`;
	return `/ws-chat?room=${encodeURIComponent(roomId)}`;
}

async function waitForChatConnected(page: Page) {
	await page.waitForFunction(
		() => document.querySelector('[data-chat-status]')?.textContent?.trim().toLowerCase() === 'connected',
		null,
		{ timeout: CONNECT_TIMEOUT },
	);
	await page.waitForFunction(
		() => {
			const sendButton = document.querySelector<HTMLButtonElement>('[data-chat-send]');
			return sendButton !== null && !sendButton.disabled;
		},
		null,
		{ timeout: CONNECT_TIMEOUT },
	);
}

async function setChatUsername(page: Page, username: string) {
	await waitForNavigationIdle(page);
	await page.evaluate((name: string) => {
		const input = document.querySelector<HTMLInputElement>('[data-chat-username]');
		if (!input) {
			return;
		}

		input.value = name;
		input.dispatchEvent(new Event('change', { bubbles: true }));
		input.blur();
	}, username);
}

async function expectConnectedUsername(page: Page, username: string) {
	await expect
		.poll(
			async () =>
				page.evaluate(
					() =>
						document.querySelector('[data-chat-status]')?.getAttribute('data-chat-connected-username') ??
						'',
				),
			{ timeout: CONNECT_TIMEOUT },
		)
		.toBe(username);
}

async function sendChatMessage(page: Page, text: string) {
	await waitForNavigationIdle(page, 5_000);
	await page.evaluate((message: string) => {
		const input = document.querySelector<HTMLInputElement>('[data-chat-input]');
		const form = document.querySelector<HTMLFormElement>('[data-chat-form]');
		if (!input || !form) {
			return;
		}

		input.value = message;
		form.requestSubmit();
	}, text);
}

test.describe('WebSocket broadcast @realtime', () => {
	test.describe.configure({ mode: 'serial' });
	test('page renders the chat UI correctly', async ({ page }, testInfo) => {
		const runtime = trackRuntimeErrors(page);

		await gotoPath(page, wsChatPath(testInfo));

		await expect(page.getByTestId(getPageTestId('/ws-chat'))).toBeVisible();
		await expect(page.locator('[data-chat-messages]')).toBeVisible();
		await expect(page.locator('[data-chat-form]')).toBeVisible();
		await expect(page.locator('[data-chat-input]')).toBeVisible();
		await expect(page.locator('[data-chat-send]')).toBeVisible();
		await expect(page.locator('[data-chat-status]')).toBeVisible();

		runtime.assertClean();
	});

	test('WebSocket connects and status transitions to connected', async ({ page }, testInfo) => {
		await gotoPath(page, wsChatPath(testInfo));
		await waitForChatConnected(page);
		await expect(page.locator('[data-chat-status-dot]')).toHaveAttribute('data-chat-status-dot', 'connected');
	});

	test('seed messages are visible in the message list after connect', async ({ page }, testInfo) => {
		await gotoPath(page, wsChatPath(testInfo, 'lobby'));
		await waitForChatConnected(page);

		await expect(page.locator('[data-chat-messages] [data-message-id]').first()).toBeVisible();

		await expect(
			page
				.locator('[data-chat-messages] .chat-lab__message-text')
				.filter({ hasText: 'Welcome to the WS Chat lab' }),
		).toBeVisible({ timeout: 6000 });

		const allTexts = await page.locator('[data-chat-messages] .chat-lab__message-text').allTextContents();
		expect(allTexts.some((t: string) => t.includes('WebSocket injection API'))).toBe(true);
	});

	test('sends a message and sees it appear in the list', async ({ page }, testInfo) => {
		await gotoPath(page, wsChatPath(testInfo));
		await waitForNavigationIdle(page);
		await waitForChatConnected(page);

		const uniqueText = `hello-${Date.now()}`;
		await sendChatMessage(page, uniqueText);

		await expect
			.poll(
				async () =>
					page.evaluate((needle: string) => {
						const texts = [
							...document.querySelectorAll('[data-chat-messages] .chat-lab__message-text'),
						].map((element) => element.textContent ?? '');
						return texts.some((text) => text.includes(needle));
					}, uniqueText),
				{ timeout: 30_000, intervals: [200, 400, 600] },
			)
			.toBe(true);
	});

	test('input is cleared after sending', async ({ page }, testInfo) => {
		await gotoPath(page, wsChatPath(testInfo));
		await waitForChatConnected(page);

		await sendChatMessage(page, 'clearing test');
		await expect(page.locator('[data-chat-input]')).toHaveValue('');
	});

	test('updates username and sends message under the new username', async ({ page }, testInfo) => {
		await gotoPath(page, wsChatPath(testInfo));
		await waitForChatConnected(page);

		await setChatUsername(page, 'cool-tester');
		await waitForChatConnected(page);
		await expectConnectedUsername(page, 'cool-tester');

		const text = `test-message-${Date.now()}`;
		await sendChatMessage(page, text);

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
				{ timeout: 15_000, intervals: [200, 400, 600] },
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
			await gotoPath(pageA, roomPath);
			await gotoPath(pageB, roomPath);

			await waitForChatConnected(pageA);
			await waitForChatConnected(pageB);

			const broadcastText = `broadcast-${Date.now()}`;
			await sendChatMessage(pageA, broadcastText);

			await expect
				.poll(
					async () => {
						try {
							await waitForNavigationIdle(pageB, 1_000);
							return await pageB.evaluate((needle: string) => {
								const texts = [
									...document.querySelectorAll('[data-chat-messages] .chat-lab__message-text'),
								].map((element) => element.textContent ?? '');
								return texts.some((text) => text.includes(needle));
							}, broadcastText);
						} catch {
							return false;
						}
					},
					{ timeout: 30_000, intervals: [200, 400, 600] },
				)
				.toBe(true);
		} finally {
			await ctxA.close();
			await ctxB.close();
		}
	});
});
