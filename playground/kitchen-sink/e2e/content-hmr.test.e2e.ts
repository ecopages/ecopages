import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '../../../e2e/app-fixture';
import {
	HMR_MUTATION_ASSERT_TIMEOUT_MS,
	gotoPathSimple,
	requestGetAndWait,
	startEcopagesHmrConnectionWatch,
} from './test-support';

test('renders an edited content entry without a reload or restarting the dev server @hmr', async ({ page, app }) => {
	const postFile = path.join(app.dir, 'src/content/posts/first-post.mdx');
	const originalPost = fs.readFileSync(postFile, 'utf8');
	try {
		const hmrReady = startEcopagesHmrConnectionWatch(page);
		await gotoPathSimple(page, '/posts/first-post');
		await hmrReady;
		await expect(page.getByTestId('post-content-first-post')).toContainText('It verifies markdown rendering');
		await page.evaluate(() => {
			(window as Window & { __keptDocument?: boolean }).__keptDocument = true;
		});

		fs.writeFileSync(
			postFile,
			originalPost.replace('It verifies markdown rendering', 'It re-renders edited content'),
		);
		await expect(page.getByTestId('post-content-first-post')).toContainText('It re-renders edited content', {
			timeout: HMR_MUTATION_ASSERT_TIMEOUT_MS,
		});
		expect(await page.evaluate(() => (window as Window & { __keptDocument?: boolean }).__keptDocument)).toBe(true);

		const html = await (await requestGetAndWait(page.request, '/posts/first-post')).text();
		expect(html).toContain('It re-renders edited content');
	} finally {
		fs.writeFileSync(postFile, originalPost);
	}
});

/**
 * Marks the `React.lazy` type that renders the entry and returns whether it was already marked.
 *
 * @remarks
 * The reloaded Page is a new function type, so React replaces every DOM node below it either way.
 * Keeping the loaded entry means the Page renders the same resolved lazy type, which only the fiber shows.
 */
function markLazyEntryType(element: Element): boolean {
	type Fiber = { elementType?: { $$typeof?: symbol; __keptLazyEntry?: boolean }; return?: Fiber };
	const fiberKey = Object.keys(element).find((key) => key.startsWith('__reactFiber$'));
	let fiber = fiberKey ? (element as unknown as Record<string, Fiber | undefined>)[fiberKey] : undefined;
	while (fiber && fiber.elementType?.$$typeof !== Symbol.for('react.lazy')) fiber = fiber.return;
	const lazyType = fiber?.elementType;
	if (!lazyType) throw new Error('No React.lazy ancestor found for the entry');
	const wasMarked = lazyType.__keptLazyEntry === true;
	lazyType.__keptLazyEntry = true;
	return wasMarked;
}

test('HMR of a collection Page keeps the loaded entry without showing the fallback @hmr', async ({ page, app }) => {
	const pageFile = path.join(app.dir, 'src/pages/posts/[slug].react.tsx');
	const originalPage = fs.readFileSync(pageFile, 'utf8');
	try {
		await page.addInitScript(() => {
			const timeline = { fallbackShown: false };
			(window as Window & { __postPageHmr?: { fallbackShown: boolean } }).__postPageHmr = timeline;
			new MutationObserver(() => {
				if (document.querySelector('[data-testid="post-loading"]')) timeline.fallbackShown = true;
			}).observe(document.documentElement, { childList: true, subtree: true });
		});
		const hmrReady = startEcopagesHmrConnectionWatch(page);
		await gotoPathSimple(page, '/posts/first-post');
		await hmrReady;
		const postContent = page.getByTestId('post-content-first-post');
		await expect(postContent).toBeVisible();
		await page.evaluate(() => {
			(window as Window & { __keptDocument?: boolean }).__keptDocument = true;
		});
		await postContent.evaluate(markLazyEntryType);

		fs.writeFileSync(pageFile, originalPage.replace('← Back to React Content', '← Back after Page HMR'));
		await expect(page.getByTestId('back-link')).toContainText('Back after Page HMR', {
			timeout: HMR_MUTATION_ASSERT_TIMEOUT_MS,
		});
		await expect(postContent).toBeVisible();
		expect(await postContent.evaluate(markLazyEntryType)).toBe(true);
		expect(
			await page.evaluate(
				() => (window as Window & { __postPageHmr?: { fallbackShown: boolean } }).__postPageHmr?.fallbackShown,
			),
		).toBe(false);
		expect(await page.evaluate(() => (window as Window & { __keptDocument?: boolean }).__keptDocument)).toBe(true);
	} finally {
		fs.writeFileSync(pageFile, originalPage);
	}
});
