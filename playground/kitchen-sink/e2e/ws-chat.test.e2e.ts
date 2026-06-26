import { expect, test, type TestInfo } from '@playwright/test';
import type { Page } from 'playwright-core';
import { getPageTestId } from '../src/data/primary-links';
import { gotoPathSimple, trackRuntimeErrors } from './test-support';

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
	const input = page.locator('[data-chat-username]');
	await input.fill(username);
	await input.blur();
}

async function expectConnectedUsername(page: Page, username: string) {
	await expect(page.locator('[data-chat-status]')).toHaveAttribute('data-chat-connected-username', username);
}

async function sendChatMessage(page: Page, text: string) {
	const input = page.locator('[data-chat-input]');
	await input.fill(text);
	await page.locator('[data-chat-form]').evaluate((form: HTMLFormElement) => {
		form.requestSubmit();
	});
}

test.describe('WebSocket broadcast @realtime', () => {
	test.describe.configure({ mode: 'serial' });
	test('page renders the chat UI correctly', async ({ page }, testInfo) => {
		const runtime = trackRuntimeErrors(page);

		await gotoPathSimple(page, wsChatPath(testInfo));

		await expect(page.getByTestId(getPageTestId('/ws-chat'))).toBeVisible();
		await expect(page.locator('[data-chat-messages]')).toBeVisible();
		await expect(page.locator('[data-chat-form]')).toBeVisible();
		await expect(page.locator('[data-chat-input]')).toBeVisible();
		await expect(page.locator('[data-chat-send]')).toBeVisible();
		await expect(page.locator('[data-chat-status]')).toBeVisible();

		runtime.assertClean();
	});

	test('WebSocket connects and status transitions to connected', async ({ page }, testInfo) => {
		await gotoPathSimple(page, wsChatPath(testInfo));
		await waitForChatConnected(page);
		await expect(page.locator('[data-chat-status-dot]')).toHaveAttribute('data-chat-status-dot', 'connected');
	});

	test('seed messages are visible in the message list after connect', async ({ page }, testInfo) => {
		await gotoPathSimple(page, wsChatPath(testInfo, 'lobby'));
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
		await gotoPathSimple(page, wsChatPath(testInfo));
		await waitForChatConnected(page);

		const uniqueText = `hello-${Date.now()}`;
		await sendChatMessage(page, uniqueText);

		await expect(
			page.locator('[data-chat-messages] .chat-lab__message-text').filter({ hasText: uniqueText }),
		).toBeVisible();
	});

	test('input is cleared after sending', async ({ page }, testInfo) => {
		await gotoPathSimple(page, wsChatPath(testInfo));
		await waitForChatConnected(page);

		await sendChatMessage(page, 'clearing test');
		await expect(page.locator('[data-chat-input]')).toHaveValue('');
	});

	test('updates username and sends message under the new username', async ({ page }, testInfo) => {
		await gotoPathSimple(page, wsChatPath(testInfo));
		await waitForChatConnected(page);

		await setChatUsername(page, 'cool-tester');
		await waitForChatConnected(page);
		await expectConnectedUsername(page, 'cool-tester');

		const text = `test-message-${Date.now()}`;
		await sendChatMessage(page, text);

		const matchingMessage = page
			.locator('[data-chat-messages] .chat-lab__message')
			.filter({ has: page.locator('.chat-lab__message-text', { hasText: text }) });

		await expect(matchingMessage.locator('.chat-lab__message-user')).toHaveText('cool-tester');
	});

	test('message sent in one tab is broadcast to a second tab', async ({ browser }, testInfo) => {
		const roomPath = wsChatPath(testInfo, `e2e-broadcast-w${testInfo.workerIndex}`);
		const ctxA = await browser.newContext();
		const ctxB = await browser.newContext();
		const pageA = await ctxA.newPage();
		const pageB = await ctxB.newPage();

		try {
			await gotoPathSimple(pageA, roomPath);
			await gotoPathSimple(pageB, roomPath);

			await waitForChatConnected(pageA);
			await waitForChatConnected(pageB);

			const broadcastText = `broadcast-${Date.now()}`;
			await sendChatMessage(pageA, broadcastText);

			await expect(
				pageB.locator('[data-chat-messages] .chat-lab__message-text').filter({ hasText: broadcastText }),
			).toBeVisible();
		} finally {
			await ctxA.close();
			await ctxB.close();
		}
	});
});
