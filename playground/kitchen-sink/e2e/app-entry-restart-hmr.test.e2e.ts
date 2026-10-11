import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import type { Page } from 'playwright-core';
import { HMR_MUTATION_ASSERT_TIMEOUT_MS, isRetriableRequestError } from './test-support';

const VITE_HOST_PROJECT = 'cross-integration-hmr-vite-e2e';
const KITCHEN_SINK_DIR = fileURLToPath(new URL('..', import.meta.url));
const PAGE_SOURCE = 'src/pages/postcss.kita.tsx';
const APP_IMPORTED_SOURCE = 'src/data/demo-data.ts';
const WEBSOCKET_HANDLER_SOURCE = 'src/handlers/ws-chat-room.ts';
const PAGE_TEXT = 'PostCSS Validation';
const LATEST_RELEASE_TITLE = 'Kitchen sink now covers real runtime paths';
const CHAT_WELCOME_TEXT = 'Welcome to the WS Chat lab';
const SUFFIX = '[app-entry-restart]';

/**
 * @remarks
 * App-entry edits and restoration restart the whole host and require cold Page compilation.
 * Use the development cold-start allowance rather than the incremental Page HMR allowance.
 */
const APP_RESTART_ASSERT_TIMEOUT_MS = 60_000;

function resolveSourceFile(projectMetadata: Record<string, unknown> | undefined, relativePath: string): string {
	const isolatedAppDir = typeof projectMetadata?.isolatedAppDir === 'string' ? projectMetadata.isolatedAppDir : null;
	return path.join(isolatedAppDir ?? KITCHEN_SINK_DIR, relativePath);
}

/**
 * Reads a route body using global fetch rather than Playwright's request context.
 *
 * @remarks
 * Each response closes its HTTP connection so polling cannot reuse a socket from the previous Vite server.
 * Requests can fail while Vite replaces its listener. HTTP errors and expected
 * connection failures return diagnostic text for the caller's polling assertion.
 */
async function fetchText(baseURL: string, pathname: string): Promise<string> {
	try {
		const response = await fetch(new URL(pathname, baseURL), {
			redirect: 'manual',
			headers: { Connection: 'close' },
		});
		if (!response.ok) {
			return `[HTTP ${response.status} for ${pathname}]`;
		}
		return await response.text();
	} catch (error) {
		if (isRetriableRequestError(error)) {
			return `[connection failed for ${pathname}: ${error instanceof Error ? error.message : String(error)}]`;
		}

		throw error;
	}
}

function toWebSocketUrl(baseURL: string, pathname: string): string {
	const url = new URL(pathname, baseURL);
	url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
	return url.href;
}

function openChatSocket(
	baseURL: string,
	roomId: string,
): Promise<{ socket: WebSocket; firstMessage: Promise<string> }> {
	return new Promise((resolve, reject) => {
		const socket = new WebSocket(toWebSocketUrl(baseURL, `/ws/chat/${roomId}?username=e2e`));
		const timer = setTimeout(() => {
			socket.close();
			reject(new Error(`WebSocket to room ${roomId} did not open`));
		}, 5_000);
		const firstMessage = new Promise<string>((resolveMessage) => {
			socket.addEventListener('message', (event) => resolveMessage(String(event.data)), { once: true });
		});
		socket.addEventListener(
			'open',
			() => {
				clearTimeout(timer);
				resolve({ socket, firstMessage });
			},
			{ once: true },
		);
		socket.addEventListener(
			'error',
			() => {
				clearTimeout(timer);
				reject(new Error(`WebSocket to room ${roomId} failed`));
			},
			{ once: true },
		);
	});
}

/**
 * Reads the first chat message, returning diagnostics on timeout or an empty string on connection failure.
 *
 * @remarks
 * Connects from the browser, not with Node's WebSocket: polled while Vite restarts, a handshake can meet the
 * closing server, and Node's client then throws an uncaught `setTypeOfService EINVAL` that fails the test.
 * Waits for the lightweight API route before opening a socket to avoid repeated failed browser handshakes
 * during host replacement. The welcome message still verifies the handler on the new connection.
 */
async function readChatWelcome(page: Page, baseURL: string): Promise<string> {
	const readiness = await fetchText(baseURL, '/api/v1/ping');
	if (!readiness.includes('"ok":true')) return readiness;
	return await page.evaluate(
		(url) =>
			new Promise<string>((resolve) => {
				const socket = new WebSocket(url);
				const finish = (message: string) => {
					clearTimeout(timer);
					socket.close();
					resolve(message);
				};
				const timer = setTimeout(() => finish('[WebSocket welcome timed out]'), 5_000);
				socket.addEventListener('message', (event) => finish(String(event.data)), { once: true });
				socket.addEventListener('error', () => finish(''), { once: true });
				socket.addEventListener('close', () => finish(''), { once: true });
			}),
		toWebSocketUrl(baseURL, '/ws/chat/lobby?username=e2e'),
	);
}

/**
 * Reads what the app serves for each edited source: the page, the route that renders the data module, and
 * the history a new chat connection receives.
 */
async function readServedContent(page: Page, baseURL: string): Promise<string> {
	const content = await Promise.all([
		fetchText(baseURL, '/postcss'),
		fetchText(baseURL, '/latest'),
		readChatWelcome(page, baseURL),
	]);
	return content.join('\n');
}

/**
 * Lists what keeps the served content from being the unedited page, release and chat welcome: each missing
 * text, and the edit marker if present. Empty when the original content is back.
 *
 * @remarks
 * Requires all three texts, not just the absence of the edit marker: while a restore restarts Vite, nothing
 * answers and the content is empty, so the next test would start against a server that is still down.
 */
function findContentMismatches(content: string): string[] {
	const missing = [PAGE_TEXT, LATEST_RELEASE_TITLE, CHAT_WELCOME_TEXT]
		.filter((text) => !content.includes(text))
		.map((text) => `missing: ${text}`);
	const failures = content
		.split('\n')
		.filter((line) => line.startsWith('[HTTP ') || line.startsWith('[connection failed '));
	const mismatches = [...missing, ...failures];
	return content.includes(SUFFIX) ? [...mismatches, `unexpected: ${SUFFIX}`] : mismatches;
}

/**
 * The Vite host restarts when a module that `app.ts` imports changes, and re-evaluates page modules per
 * request without restarting.
 *
 * @remarks
 * A restart closes the Vite HTTP server, which drops every open WebSocket, so an open chat socket tells
 * whether an edit restarted Vite.
 */
test.describe('Vite host app entry restart @hmr', () => {
	test.describe.configure({ mode: 'serial' });

	const originals = new Map<string, string>();

	function restoreMutatedSources() {
		for (const [file, content] of originals) {
			if (fs.readFileSync(file, 'utf-8') !== content) {
				fs.writeFileSync(file, content, 'utf-8');
			}
		}
	}

	// oxlint-disable-next-line no-empty-pattern
	test.beforeAll(async ({}, testInfo) => {
		test.skip(testInfo.project.name !== VITE_HOST_PROJECT, 'Only the Vite host restarts on app entry changes');
		const metadata = testInfo.project.metadata as Record<string, unknown> | undefined;
		for (const relativePath of [PAGE_SOURCE, APP_IMPORTED_SOURCE, WEBSOCKET_HANDLER_SOURCE]) {
			const file = resolveSourceFile(metadata, relativePath);
			originals.set(file, fs.readFileSync(file, 'utf-8'));
		}
	});

	test.afterEach(async ({ page, baseURL }) => {
		if (originals.size === 0) {
			return;
		}
		restoreMutatedSources();
		await expect
			.poll(() => readServedContent(page, baseURL!).then(findContentMismatches), {
				timeout: APP_RESTART_ASSERT_TIMEOUT_MS,
			})
			.toEqual([]);
	});

	test.afterAll(() => {
		restoreMutatedSources();
	});

	test('a page edit reaches the next request without restarting Vite', async ({ baseURL }, testInfo) => {
		const pageFile = resolveSourceFile(testInfo.project.metadata, PAGE_SOURCE);
		await expect
			.poll(() => fetchText(baseURL!, '/postcss'), { timeout: HMR_MUTATION_ASSERT_TIMEOUT_MS })
			.toContain(PAGE_TEXT);
		const { socket } = await openChatSocket(baseURL!, 'app-entry-restart-page');

		fs.writeFileSync(pageFile, originals.get(pageFile)!.replace(PAGE_TEXT, `${PAGE_TEXT} ${SUFFIX}`), 'utf-8');

		await expect
			.poll(() => fetchText(baseURL!, '/postcss'), { timeout: HMR_MUTATION_ASSERT_TIMEOUT_MS })
			.toContain(`${PAGE_TEXT} ${SUFFIX}`);
		expect(socket.readyState).toBe(WebSocket.OPEN);
		socket.close();
	});

	test('an edit to a module app.ts imports reaches the next request after a restart', async ({
		baseURL,
	}, testInfo) => {
		const dataFile = resolveSourceFile(testInfo.project.metadata, APP_IMPORTED_SOURCE);
		await expect
			.poll(() => fetchText(baseURL!, '/latest'), { timeout: HMR_MUTATION_ASSERT_TIMEOUT_MS })
			.toContain(LATEST_RELEASE_TITLE);
		const { socket } = await openChatSocket(baseURL!, 'app-entry-restart-data');

		fs.writeFileSync(
			dataFile,
			originals
				.get(dataFile)!
				.replace(`title: '${LATEST_RELEASE_TITLE}'`, `title: '${LATEST_RELEASE_TITLE} ${SUFFIX}'`),
			'utf-8',
		);

		await expect
			.poll(() => fetchText(baseURL!, '/latest'), { timeout: APP_RESTART_ASSERT_TIMEOUT_MS })
			.toContain(`${LATEST_RELEASE_TITLE} ${SUFFIX}`);
		await expect.poll(() => socket.readyState).toBe(WebSocket.CLOSED);
	});

	test('a WebSocket handler edit reaches a new connection', async ({ page, baseURL }, testInfo) => {
		const handlerFile = resolveSourceFile(testInfo.project.metadata, WEBSOCKET_HANDLER_SOURCE);

		fs.writeFileSync(
			handlerFile,
			originals.get(handlerFile)!.replace(CHAT_WELCOME_TEXT, `${CHAT_WELCOME_TEXT} ${SUFFIX}`),
			'utf-8',
		);

		await expect
			.poll(() => readChatWelcome(page, baseURL!), { timeout: APP_RESTART_ASSERT_TIMEOUT_MS })
			.toContain(`${CHAT_WELCOME_TEXT} ${SUFFIX}`);
	});
});
