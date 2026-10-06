import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import type { APIRequestContext } from 'playwright-core';
import { HMR_MUTATION_ASSERT_TIMEOUT_MS } from './test-support';

const VITE_HOST_PROJECT = 'cross-integration-hmr-vite-e2e';
const KITCHEN_SINK_DIR = fileURLToPath(new URL('..', import.meta.url));
const PAGE_SOURCE = 'src/pages/postcss.kita.tsx';
const APP_IMPORTED_SOURCE = 'src/data/demo-data.ts';
const WEBSOCKET_HANDLER_SOURCE = 'src/handlers/ws-chat-room.ts';
const PAGE_TEXT = 'PostCSS Validation';
const LATEST_RELEASE_TITLE = 'Kitchen sink now covers real runtime paths';
const CHAT_WELCOME_TEXT = 'Welcome to the WS Chat lab';
const SUFFIX = '[app-entry-restart]';

function resolveSourceFile(projectMetadata: Record<string, unknown> | undefined, relativePath: string): string {
	const isolatedAppDir = typeof projectMetadata?.isolatedAppDir === 'string' ? projectMetadata.isolatedAppDir : null;
	return path.join(isolatedAppDir ?? KITCHEN_SINK_DIR, relativePath);
}

async function fetchText(request: APIRequestContext, pathname: string): Promise<string> {
	try {
		return await (await request.get(pathname)).text();
	} catch {
		return '';
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
 * Reads what the app serves for each edited source: the page, the route that renders the data module, and
 * the history a new chat connection receives.
 */
async function readServedContent(request: APIRequestContext, baseURL: string): Promise<string> {
	const pages = await Promise.all([fetchText(request, '/postcss'), fetchText(request, '/latest')]);
	try {
		const { socket, firstMessage } = await openChatSocket(baseURL, 'lobby');
		const history = await firstMessage;
		socket.close();
		return [...pages, history].join('\n');
	} catch {
		return pages.join('\n');
	}
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

	test.afterEach(async ({ request, baseURL }) => {
		if (originals.size === 0) {
			return;
		}
		restoreMutatedSources();
		await expect
			.poll(() => readServedContent(request, baseURL!), { timeout: HMR_MUTATION_ASSERT_TIMEOUT_MS })
			.not.toContain(SUFFIX);
	});

	test.afterAll(() => {
		restoreMutatedSources();
	});

	test('a page edit reaches the next request without restarting Vite', async ({ request, baseURL }, testInfo) => {
		const pageFile = resolveSourceFile(testInfo.project.metadata, PAGE_SOURCE);
		await expect
			.poll(() => fetchText(request, '/postcss'), { timeout: HMR_MUTATION_ASSERT_TIMEOUT_MS })
			.toContain(PAGE_TEXT);
		const { socket } = await openChatSocket(baseURL!, 'app-entry-restart-page');

		fs.writeFileSync(pageFile, originals.get(pageFile)!.replace(PAGE_TEXT, `${PAGE_TEXT} ${SUFFIX}`), 'utf-8');

		await expect
			.poll(() => fetchText(request, '/postcss'), { timeout: HMR_MUTATION_ASSERT_TIMEOUT_MS })
			.toContain(`${PAGE_TEXT} ${SUFFIX}`);
		expect(socket.readyState).toBe(WebSocket.OPEN);
		socket.close();
	});

	test('an edit to a module app.ts imports reaches the next request after a restart', async ({
		request,
		baseURL,
	}, testInfo) => {
		const dataFile = resolveSourceFile(testInfo.project.metadata, APP_IMPORTED_SOURCE);
		await expect
			.poll(() => fetchText(request, '/latest'), { timeout: HMR_MUTATION_ASSERT_TIMEOUT_MS })
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
			.poll(() => fetchText(request, '/latest'), { timeout: HMR_MUTATION_ASSERT_TIMEOUT_MS })
			.toContain(`${LATEST_RELEASE_TITLE} ${SUFFIX}`);
		await expect.poll(() => socket.readyState).toBe(WebSocket.CLOSED);
	});

	test('a WebSocket handler edit reaches a new connection', async ({ request, baseURL }, testInfo) => {
		const handlerFile = resolveSourceFile(testInfo.project.metadata, WEBSOCKET_HANDLER_SOURCE);

		fs.writeFileSync(
			handlerFile,
			originals.get(handlerFile)!.replace(CHAT_WELCOME_TEXT, `${CHAT_WELCOME_TEXT} ${SUFFIX}`),
			'utf-8',
		);

		await expect
			.poll(() => readServedContent(request, baseURL!), { timeout: HMR_MUTATION_ASSERT_TIMEOUT_MS })
			.toContain(`${CHAT_WELCOME_TEXT} ${SUFFIX}`);
	});
});
