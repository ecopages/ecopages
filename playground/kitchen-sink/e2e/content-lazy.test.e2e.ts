import { expect, test } from '@playwright/test';
import type { Page } from 'playwright-core';
import { kitchenSinkShellTestId } from '../src/data/primary-links';
import { gotoPath, requestGetAndWait, trackRuntimeErrors } from './helpers';

type PostTimeline = {
	fallbackShown: boolean;
	frames: Array<{ first: boolean; second: boolean }>;
};

type TimelineWindow = Window & { __postTimeline?: PostTimeline };

const firstPost = 'post-content-first-post';
const secondPost = 'post-content-second-post';

/** Records, per DOM mutation batch once a post is on screen, which post it is and whether the loading fallback ever mounted. */
async function recordPostTimeline(page: Page) {
	await page.addInitScript(
		({ first, second }) => {
			const timeline: PostTimeline = { fallbackShown: false, frames: [] };
			(window as TimelineWindow).__postTimeline = timeline;
			new MutationObserver(() => {
				if (document.querySelector('[data-testid="post-loading"]')) timeline.fallbackShown = true;
				const frame = {
					first: !!document.querySelector(`[data-testid="${first}"]`),
					second: !!document.querySelector(`[data-testid="${second}"]`),
				};
				if (timeline.frames.length > 0 || frame.first || frame.second) timeline.frames.push(frame);
			}).observe(document, { childList: true, subtree: true });
		},
		{ first: firstPost, second: secondPost },
	);
}

function readTimeline(page: Page): Promise<PostTimeline> {
	return page.evaluate(() => (window as TimelineWindow).__postTimeline!);
}

async function waitForHydratedPost(page: Page, testId: string) {
	await expect
		.poll(() =>
			page
				.getByTestId(testId)
				.evaluate((element) => Object.keys(element).some((key) => key.startsWith('__reactFiber'))),
		)
		.toBe(true);
}

/**
 * Holds the first `first-post` chunk so the test can see the server HTML, then
 * aborts it. Later requests continue when `failOnce` is set.
 */
async function holdFirstPostChunk(page: Page, options?: { failOnce?: boolean }) {
	let chunkRequests = 0;
	let release!: () => void;
	const firstHeld = new Promise<void>((resolve) => {
		release = resolve;
	});
	await page.route(/\/content\/posts\/first-post\.js/, async (route) => {
		chunkRequests += 1;
		if (chunkRequests === 1) {
			await firstHeld;
		}
		if (options?.failOnce && chunkRequests > 1) {
			await route.continue();
			return;
		}
		await route.abort();
	});
	return {
		release,
		get chunkRequests() {
			return chunkRequests;
		},
	};
}

async function expectServerPostVisible(page: Page) {
	await expect(page.getByTestId('page-post')).toBeVisible();
	await expect(page.getByTestId(firstPost)).toBeVisible();
	await expect(page.getByTestId(kitchenSinkShellTestId)).toBeVisible();
	await expect(page.getByTestId('post-loading')).toHaveCount(0);
}

async function expectNoFurtherDocument(page: Page, urlPart: string) {
	const extra = await page
		.waitForEvent('request', {
			predicate: (request) => request.resourceType() === 'document' && request.url().includes(urlPart),
			timeout: 1_500,
		})
		.then(() => 'reload')
		.catch(() => 'none');
	expect(extra).toBe('none');
}

test.describe('Collection Pages render MDX through React.lazy @content', () => {
	test('serves the post MDX in the server HTML', async ({ request }) => {
		const response = await requestGetAndWait(request, '/posts/first-post');
		const html = await response.text();

		expect(html).toContain(`data-testid="${firstPost}"`);
		expect(html).toContain('It verifies markdown rendering');
		expect(html).not.toContain('post-loading');
	});

	test('hydration keeps the server HTML without a fallback or a mismatch', async ({ page }) => {
		const runtime = trackRuntimeErrors(page);
		const hydrationErrors: string[] = [];
		page.on('console', (message) => {
			if (message.text().includes('Hydration error')) hydrationErrors.push(message.text());
		});
		await recordPostTimeline(page);

		await gotoPath(page, '/posts/first-post');
		await expect(page.getByTestId(firstPost)).toBeVisible();
		await waitForHydratedPost(page, firstPost);

		const timeline = await readTimeline(page);
		expect(timeline.fallbackShown).toBe(false);
		expect(timeline.frames.length).toBeGreaterThan(0);
		expect(timeline.frames.every((frame) => frame.first)).toBe(true);
		expect(hydrationErrors).toEqual([]);
		runtime.assertClean();
	});

	test('client navigation keeps the current post on screen until the next one renders', async ({ page }) => {
		const runtime = trackRuntimeErrors(page);
		let releaseSecondPost!: () => void;
		const secondPostHeld = new Promise<void>((resolve) => {
			releaseSecondPost = resolve;
		});
		let secondPostRequested!: () => void;
		const secondPostRequest = new Promise<void>((resolve) => {
			secondPostRequested = resolve;
		});
		await page.route(/\/content\/posts\/second-post\.js/, async (route) => {
			secondPostRequested();
			await secondPostHeld;
			await route.continue();
		});
		await recordPostTimeline(page);

		await gotoPath(page, '/posts/first-post');
		await waitForHydratedPost(page, firstPost);
		await page.getByTestId('next-post-link').click();
		await secondPostRequest;

		await expect(page.getByTestId(firstPost)).toBeVisible();
		await expect(page.getByTestId('post-loading')).toHaveCount(0);
		expect((await readTimeline(page)).fallbackShown).toBe(false);

		releaseSecondPost();
		await expect(page.getByTestId(secondPost)).toBeVisible();
		await expect(page.getByTestId(firstPost)).toHaveCount(0);

		const timeline = await readTimeline(page);
		expect(timeline.fallbackShown).toBe(false);
		expect(timeline.frames.length).toBeGreaterThan(0);
		expect(timeline.frames.every((frame) => frame.first || frame.second)).toBe(true);
		runtime.assertClean();
	});

	test('a post chunk that fails during client navigation becomes a full navigation', async ({ page }) => {
		let chunkRequests = 0;
		let documentRequests = 0;
		page.on('request', (request) => {
			if (request.resourceType() === 'document' && request.url().endsWith('/posts/second-post')) {
				documentRequests += 1;
			}
		});
		await page.route(/\/content\/posts\/second-post\.js/, async (route) => {
			chunkRequests += 1;
			if (chunkRequests === 1) {
				await route.abort();
				return;
			}
			await route.continue();
		});

		await gotoPath(page, '/posts/first-post');
		await waitForHydratedPost(page, firstPost);
		await page.getByTestId('next-post-link').click();

		await expect(page).toHaveURL(/\/posts\/second-post$/);
		await expect(page.getByTestId(secondPost)).toBeVisible();
		await expect(page.getByTestId('post-title')).toHaveText('Second Post');
		await waitForHydratedPost(page, secondPost);
		expect(chunkRequests).toBe(2);
		expect(documentRequests).toBe(1);
	});

	test('a chunk that keeps failing is not reloaded again after the full navigation', async ({ page }) => {
		let chunkRequests = 0;
		let documentRequests = 0;
		await page.route(/\/content\/posts\/second-post\.js/, async (route) => {
			chunkRequests += 1;
			await route.abort();
		});
		page.on('request', (request) => {
			if (request.resourceType() === 'document' && request.url().endsWith('/posts/second-post')) {
				documentRequests += 1;
			}
		});

		await gotoPath(page, '/posts/first-post');
		await waitForHydratedPost(page, firstPost);
		await page.getByTestId('next-post-link').click();

		await expect.poll(() => chunkRequests).toBeGreaterThanOrEqual(2);
		await expect(page).toHaveURL(/\/posts\/second-post$/);
		await page.waitForLoadState('networkidle');
		expect(documentRequests).toBe(1);
	});
});

test.describe('First hydration of a collection Page @content', () => {
	test('a post chunk that fails once during first hydration keeps the server HTML and is not retried', async ({
		page,
	}) => {
		let documentRequests = 0;
		page.on('request', (request) => {
			if (request.resourceType() === 'document' && request.url().includes('/posts/first-post')) {
				documentRequests += 1;
			}
		});
		const chunk = await holdFirstPostChunk(page, { failOnce: true });

		await gotoPath(page, '/posts/first-post');
		await expectServerPostVisible(page);
		await expect.poll(() => chunk.chunkRequests).toBeGreaterThanOrEqual(1);
		chunk.release();

		await expectServerPostVisible(page);
		await expectNoFurtherDocument(page, '/posts/first-post');
		expect(documentRequests).toBe(1);
		expect(chunk.chunkRequests).toBe(1);
	});

	test('a post chunk that always fails during first hydration keeps the server HTML', async ({ page }) => {
		let documentRequests = 0;
		page.on('request', (request) => {
			if (request.resourceType() === 'document' && request.url().includes('/posts/first-post')) {
				documentRequests += 1;
			}
		});
		const chunk = await holdFirstPostChunk(page);

		await gotoPath(page, '/posts/first-post');
		await expectServerPostVisible(page);
		await expect.poll(() => chunk.chunkRequests).toBeGreaterThanOrEqual(1);
		chunk.release();

		await expectServerPostVisible(page);
		await expectNoFurtherDocument(page, '/posts/first-post');
		expect(documentRequests).toBe(1);
		expect(chunk.chunkRequests).toBe(1);
	});
});

test.describe('First hydration with a Page-level error boundary around the lazy entry @content', () => {
	test('a chunk that always fails is caught by the Page error boundary', async ({ page }) => {
		let documentRequests = 0;
		page.on('request', (request) => {
			if (request.resourceType() === 'document' && request.url().includes('/bounded-post')) {
				documentRequests += 1;
			}
		});
		const chunk = await holdFirstPostChunk(page);

		await gotoPath(page, '/bounded-post');
		await expect(page.getByTestId('page-post-bounded')).toBeVisible();
		await expect(page.getByTestId('bounded-rest')).toBeVisible();
		await expect(page.getByTestId(firstPost)).toBeVisible();
		await expect.poll(() => chunk.chunkRequests).toBeGreaterThanOrEqual(1);
		chunk.release();

		await expect(page.getByTestId('page-post-bounded')).toBeVisible();
		await expect(page.getByTestId('bounded-rest')).toBeVisible();
		await expect(page.getByTestId('entry-error')).toBeVisible();
		await expect(page.getByTestId(firstPost)).toHaveCount(0);
		await expect(page.getByTestId('post-loading')).toHaveCount(0);
		await expectNoFurtherDocument(page, '/bounded-post');
		expect(documentRequests).toBe(1);
	});

	test('a chunk that fails once is still caught by the Page error boundary', async ({ page }) => {
		const chunk = await holdFirstPostChunk(page, { failOnce: true });

		await gotoPath(page, '/bounded-post');
		await expect(page.getByTestId('bounded-rest')).toBeVisible();
		await expect(page.getByTestId(firstPost)).toBeVisible();
		await expect.poll(() => chunk.chunkRequests).toBeGreaterThanOrEqual(1);
		chunk.release();

		await expect(page.getByTestId('bounded-rest')).toBeVisible();
		await expect(page.getByTestId('entry-error')).toBeVisible();
		await expect(page.getByTestId(firstPost)).toHaveCount(0);
		await expect(page.getByTestId('post-loading')).toHaveCount(0);
	});
});
