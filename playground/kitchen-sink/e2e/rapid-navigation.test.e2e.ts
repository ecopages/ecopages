import { expect, test, type Page } from '@playwright/test';
import { getPrimaryLinkTestId, getRouteLinkTestId, primaryLinks } from '../src/data/primary-links';
import { clickHrefAndWait, gotoAndWait, settleOnRoute, trackRuntimeErrors } from './helpers';

const primaryRoutePool = primaryLinks.map(({ href }) => href);
const randomSequenceCount = 4;
const randomSequenceLength = 12;
const broadRouteStressRounds = 3;

function shuffleRoutes(routes: string[]) {
	const shuffled = [...routes];

	for (let index = shuffled.length - 1; index > 0; index -= 1) {
		const swapIndex = Math.floor(Math.random() * (index + 1));
		const current = shuffled[index] ?? '';
		shuffled[index] = shuffled[swapIndex] ?? current;
		shuffled[swapIndex] = current;
	}

	return shuffled;
}

function pickNextRoute(currentHref: string) {
	const candidates = primaryRoutePool.filter((href) => href !== currentHref);
	return candidates[Math.floor(Math.random() * candidates.length)] ?? currentHref;
}

function buildRandomSequence(
	length: number,
	startHref = primaryRoutePool[Math.floor(Math.random() * primaryRoutePool.length)] ?? '/',
) {
	const sequence = [startHref];

	while (sequence.length < length) {
		sequence.push(pickNextRoute(sequence[sequence.length - 1] ?? startHref));
	}

	return sequence;
}

function buildBroadRouteStressSequence(rounds: number, startHref = '/') {
	const sequence = [startHref];
	let currentHref = startHref;

	for (let round = 0; round < rounds; round += 1) {
		const roundRoutes = shuffleRoutes(primaryRoutePool.filter((href) => href !== currentHref));

		sequence.push(...roundRoutes);
		currentHref = roundRoutes[roundRoutes.length - 1] ?? currentHref;
	}

	return sequence;
}

function getKitchenSinkRouteLocator(page: Page, href: string) {
	const routeLink = page.getByTestId(getRouteLinkTestId(href)).first();
	const primaryLink = page.getByTestId(getPrimaryLinkTestId(href)).first();
	return { routeLink, primaryLink };
}

async function rapidClick(link: ReturnType<Page['getByTestId']>) {
	await link.click({
		force: true,
		noWaitAfter: true,
		timeout: 1500,
	});
}

async function rapidClickHref(
	page: Page,
	href: string,
	preferredOrder: Array<'primary' | 'route'> = ['primary', 'route'],
	options: { requireMatch?: boolean } = {},
) {
	const { requireMatch = false } = options;
	const { routeLink, primaryLink } = getKitchenSinkRouteLocator(page, href);
	const fallbackLink = page.locator(`a[href="${href}"]`).first();
	const candidates = [...preferredOrder.map((kind) => (kind === 'route' ? routeLink : primaryLink)), fallbackLink];

	for (let attempt = 0; attempt < 3; attempt += 1) {
		for (const link of candidates) {
			const exists = (await link.count().catch(() => 0)) > 0;
			if (!exists) {
				continue;
			}

			try {
				await rapidClick(link);
				return true;
			} catch (error) {
				if (
					!(error instanceof Error) ||
					(!error.message.includes('Element is not visible') &&
						!error.message.includes('Target page, context or browser has been closed') &&
						!error.message.includes('Element is not attached to the DOM'))
				) {
					throw error;
				}
			}
		}

		if (attempt < 2) {
			await page.waitForTimeout(100);
		}
	}

	if (requireMatch) {
		throw new Error(`No matching link found for ${href}`);
	}

	return false;
}

test.describe('Rapid navigation stress', () => {
	for (const index of Array.from({ length: randomSequenceCount }, (_, sequenceIndex) => sequenceIndex + 1)) {
		test(`survives random rapid-clicking sequence ${index}`, async ({ page }, testInfo) => {
			const runtime = trackRuntimeErrors(page);
			const sequence = buildRandomSequence(randomSequenceLength);
			testInfo.annotations.push({
				type: 'random-sequence',
				description: sequence.join(' -> '),
			});

			await gotoAndWait(page, sequence[0]);

			for (const href of sequence.slice(1)) {
				await rapidClickHref(page, href);
			}

			await page.waitForLoadState('networkidle');
			await expect(page).not.toHaveURL(/undefined|null/);
			await expect(page.locator('body')).not.toContainText('Cannot read properties of null');
			await expect(page.locator('body')).not.toContainText('Invalid hook call');
			runtime.assertClean();
		});
	}

	test('survives a broad randomized route-pool run without a crash', async ({ page }) => {
		const runtime = trackRuntimeErrors(page);
		const broadRouteStressSequence = buildBroadRouteStressSequence(broadRouteStressRounds, '/');

		await gotoAndWait(page, broadRouteStressSequence[0] ?? '/');

		for (const href of broadRouteStressSequence.slice(1)) {
			await rapidClickHref(page, href);
		}

		await page.waitForLoadState('networkidle');
		await expect(page).not.toHaveURL(/undefined|null/);
		await expect(page.locator('body')).not.toContainText('Cannot read properties of null');
		await expect(page.locator('body')).not.toContainText('Invalid hook call');
		runtime.assertClean();
	});

	test('loads the correct page content after rapid hops ending on a React route', async ({ page }) => {
		const runtime = trackRuntimeErrors(page);

		await gotoAndWait(page, '/docs');

		const hops = ['/react-lab', '/docs', '/react-content', '/react-lab', '/react-content'];
		for (const href of hops.slice(0, -1)) {
			await rapidClickHref(page, href);
		}
		await rapidClickHref(page, hops[hops.length - 1], ['primary', 'route'], { requireMatch: true });

		await page.waitForLoadState('networkidle');
		await expect(page.getByTestId('page-react-content')).toBeVisible({
			timeout: 8000,
		});
		await expect(page).toHaveURL(/\/react-content/);
		runtime.assertClean();
	});

	test('loads the correct page content after rapid hops ending on a non-React route', async ({ page }) => {
		const runtime = trackRuntimeErrors(page);

		await gotoAndWait(page, '/react-content');

		const hops = ['/docs', '/react-lab', '/react-content', '/docs'];
		for (const href of hops.slice(0, -1)) {
			await rapidClickHref(page, href);
		}
		await rapidClickHref(page, hops[hops.length - 1], ['primary', 'route'], { requireMatch: true });

		await page.waitForLoadState('networkidle');
		await expect(page.getByTestId('page-docs')).toBeVisible({
			timeout: 8000,
		});
		await expect(page).toHaveURL(/\/docs/);
		runtime.assertClean();
	});

	test('loads the correct React route content after rapid route-link hops', async ({ page }) => {
		const runtime = trackRuntimeErrors(page);

		await gotoAndWait(page, '/react-lab');

		const hops = ['/react-content', '/react-notes', '/react-lab', '/react-notes'];
		for (const href of hops.slice(0, -1)) {
			await rapidClickHref(page, href, ['route', 'primary']);
		}
		await rapidClickHref(page, hops[hops.length - 1], ['route', 'primary'], { requireMatch: true });

		await settleOnRoute({
			page,
			href: '/react-notes',
			content: page.getByTestId('page-react-notes'),
			navigate: () => rapidClickHref(page, '/react-notes', ['route', 'primary'], { requireMatch: true }),
		});
		runtime.assertClean();
	});

	test('loads server-derived React route content after rapid browser-router hops', async ({ page }) => {
		const runtime = trackRuntimeErrors(page);

		await gotoAndWait(page, '/');

		const hops = ['/docs', '/react-server-files'];
		for (const href of hops.slice(0, -1)) {
			await rapidClickHref(page, href);
		}
		await rapidClickHref(page, hops[hops.length - 1], ['primary', 'route'], { requireMatch: true });

		await page.waitForLoadState('networkidle');
		await expect(page.getByRole('heading', { name: 'Server-only file tree' })).toBeVisible({
			timeout: 8000,
		});
		await expect(page.locator('body')).toContainText('src/pages');
		await expect(page).toHaveURL(/\/react-server-files/);
		runtime.assertClean();
	});
});
