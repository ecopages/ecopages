import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test, expect } from '../../app-fixture';

type Snapshot = {
	counters: Record<string, string>;
	connect: Record<string, number>;
	disconnect: Record<string, number>;
	plainActive: boolean;
	marker: string | undefined;
	lib: string | undefined;
	note: string | null;
	rerunRuns: number;
};

async function snapshot(page: Page): Promise<Snapshot> {
	return page.evaluate(() => {
		const w = window as unknown as {
			__marker?: string;
			__probe?: { connect: Record<string, number>; disconnect: Record<string, number>; lib: string };
			__ECO_E2E_SHARED_CHUNK__?: { initCount: number; rerunCount: number };
		};
		const text = (id: string) => {
			const el = document.getElementById(id);
			return (el?.shadowRoot ?? el)?.querySelector('button')?.textContent ?? '';
		};
		return {
			counters: { light: text('light'), shadow: text('shadow'), persisted: text('persisted') },
			connect: { ...w.__probe?.connect },
			disconnect: { ...w.__probe?.disconnect },
			plainActive: document.getElementById('plain')?.classList.contains('is-active') ?? false,
			marker: w.__marker,
			lib: w.__probe?.lib,
			note: document.getElementById('page-note')?.textContent ?? null,
			rerunRuns: (w.__ECO_E2E_SHARED_CHUNK__?.initCount ?? 0) + (w.__ECO_E2E_SHARED_CHUNK__?.rerunCount ?? 0),
		};
	});
}

async function prepare(page: Page, url: string) {
	await page.goto(url, { waitUntil: 'load' });
	await expect(page.locator('#plain')).toHaveClass(/is-active/);
	for (const id of ['light', 'shadow', 'persisted']) {
		const button = page.locator(`#${id} button`);
		for (let i = 0; i < 3; i++) await button.click();
		await expect(button).toHaveText('Count: 3');
	}
	await page.evaluate(() => {
		(window as unknown as { __marker: string }).__marker = 'alive';
	});
}

function recordHmrEvents(page: Page): string[] {
	const events: string[] = [];
	page.on('websocket', (socket) =>
		socket.on('framereceived', (frame) => {
			const type = (JSON.parse(String(frame.payload)) as { type?: string }).type;
			if (type) events.push(type);
		}),
	);
	return events;
}

async function expectStateKept(
	page: Page,
	before: Snapshot,
	{ softReload, rerunRoute }: { softReload: boolean; rerunRoute: boolean },
) {
	const after = await snapshot(page);
	expect(after.marker, 'document is not reloaded').toBe('alive');
	expect(after.counters).toEqual({ light: 'Count: 3', shadow: 'Count: 3', persisted: 'Count: 3' });
	expect(after.plainActive, 'runtime class survives').toBe(true);
	expect(after.disconnect.light ?? 0, 'light-DOM counter is not reconnected').toBe(0);
	expect(after.disconnect.shadow ?? 0, 'shadow counter is not reconnected').toBe(0);
	if (softReload && rerunRoute) {
		await expect
			.poll(async () => (await snapshot(page)).rerunRuns, { message: 'the data-eco-rerun script runs again' })
			.toBeGreaterThan(before.rerunRuns);
	}
}

for (const route of ['/hmr-soft-reload', '/hmr-soft-reload/rerun']) {
	test.describe(`HMR soft reload ${route}`, () => {
		const edits: Array<{
			name: string;
			file: string;
			from: string;
			to: string;
			event: string;
			waitFor: (p: Page) => Promise<void>;
		}> = [
			{
				name: 'non-page module',
				file: 'src/pages/hmr-soft-reload/probe-lib.ts',
				from: 'lib-v1',
				to: 'lib-v2',
				event: 'update',
				waitFor: async (p) => {
					await expect.poll(async () => (await snapshot(p)).lib, { timeout: 10_000 }).toBe('lib-v2');
				},
			},
			{
				name: 'page module',
				file: `src/pages/hmr-soft-reload/${route.endsWith('rerun') ? 'rerun' : 'index'}.kita.tsx`,
				from: 'note-v1',
				to: 'note-v2',
				event: 'layout-update',
				waitFor: async (p) => {
					await expect.poll(async () => (await snapshot(p)).note, { timeout: 10_000 }).toBe('note-v2');
				},
			},
			{
				name: 'layout module',
				file: 'src/layouts/base-layout.kita.tsx',
				from: 'data-testid="base-layout"',
				to: 'data-testid="base-layout" data-layout-v="2"',
				event: 'layout-update',
				waitFor: async (p) => {
					await expect(p.locator('[data-layout-v="2"]')).toHaveCount(1, { timeout: 10_000 });
				},
			},
		];

		for (const edit of edits) {
			test(`edit ${edit.name}`, async ({ page, app }) => {
				const file = path.join(app.dir, edit.file);
				const original = readFileSync(file, 'utf-8');
				const events = recordHmrEvents(page);
				let edited = false;
				try {
					await prepare(page, route);
					const before = await snapshot(page);
					await writeFile(file, original.replace(edit.from, edit.to), { flush: true });
					edited = true;
					await edit.waitFor(page);

					expect(events).toEqual([edit.event]);
					await expectStateKept(page, before, {
						softReload: edit.event === 'layout-update',
						rerunRoute: route.endsWith('rerun'),
					});
				} finally {
					if (edited) {
						const sent = events.length;
						await writeFile(file, original, { flush: true });
						await expect.poll(() => events.length, { timeout: 10_000 }).toBeGreaterThan(sent);
					}
				}
			});
		}

		test('soft reload through the navigation runtime', async ({ page }) => {
			await prepare(page, route);
			const before = await snapshot(page);
			const handled = await page.evaluate(async () => {
				const nav = (
					window as unknown as {
						__ECO_PAGES__: { navigation: { reloadCurrentPage(r: unknown): Promise<boolean> } };
					}
				).__ECO_PAGES__.navigation;
				return nav.reloadCurrentPage({ clearCache: true });
			});

			expect(handled).toBe(true);
			await expectStateKept(page, before, { softReload: true, rerunRoute: route.endsWith('rerun') });
		});
	});
}
