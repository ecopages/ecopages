import { expect, test, type Page } from '@playwright/test';
import { getPrimaryLinkTestId, getRouteLinkTestId, primaryLinks } from '../src/data/primary-links';
import { assertSingleAppShell, gotoAndWait, settleOnRoute, trackRuntimeErrors } from './helpers';

const primaryRoutePool = primaryLinks.map(({ href }) => href);

const broadTraversalSequence = [
	'/',
	'/react-lab',
	'/integration-matrix/lit-entry',
	'/docs',
	'/react-content',
	'/integration-matrix',
	'/react-server-files',
	'/patterns/middleware',
	'/integration-matrix/react-entry',
	'/catalog/semantic-html',
	'/postcss',
	'/react-server-metadata',
	'/images',
	'/explicit/team',
	'/transitions',
	'/latest',
	'/api-lab',
];

const crossTechnologySequences = [
	['/docs', '/react-lab', '/integration-matrix/lit-entry', '/api-lab', '/react-content', '/postcss'],
	[
		'/react-lab',
		'/react-content',
		'/catalog/semantic-html',
		'/integration-matrix/lit-entry',
		'/react-server-files',
		'/docs',
	],
	[
		'/integration-matrix/lit-entry',
		'/react-lab',
		'/patterns/middleware',
		'/react-content',
		'/latest',
		'/integration-matrix/react-entry',
	],
	['/api-lab', '/react-content', '/docs', '/integration-matrix/lit-entry', '/explicit/team', '/react-lab'],
];

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
	const targetUrl = new URL(href, page.url());
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

	if (page.url() === targetUrl.href) {
		return true;
	}

	if (requireMatch) {
		throw new Error(`No matching link found for ${href}`);
	}

	return false;
}

test.describe('Rapid navigation stress', () => {
	test('survives a full route traversal without a crash', async ({ page }) => {
		const runtime = trackRuntimeErrors(page);

		await gotoAndWait(page, broadTraversalSequence[0] ?? '/');

		for (const href of broadTraversalSequence.slice(1)) {
			await rapidClickHref(page, href);
		}

		await page.waitForLoadState('networkidle');
		await expect(page).not.toHaveURL(/undefined|null/);
		await expect(page.locator('body')).not.toContainText('Cannot read properties of null');
		await expect(page.locator('body')).not.toContainText('Invalid hook call');
		await assertSingleAppShell(page);
		runtime.assertClean();
	});

	for (let index = 0; index < crossTechnologySequences.length; index += 1) {
		test(`survives cross-technology rapid-clicking sequence ${index + 1}`, async ({ page }) => {
			const runtime = trackRuntimeErrors(page);
			const sequence = crossTechnologySequences[index];

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
			content: page.getByRole('heading', { name: 'React Notes' }),
			navigate: () => rapidClickHref(page, '/react-notes', ['route', 'primary'], { requireMatch: true }),
		});
		await assertSingleAppShell(page);
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

		await settleOnRoute({
			page,
			href: '/react-server-files',
			content: page.getByRole('heading', { name: 'Server-only file tree' }),
			navigate: () => rapidClickHref(page, '/react-server-files', ['primary', 'route'], { requireMatch: true }),
		});
		await expect(page.locator('body')).toContainText('src/pages');
		await assertSingleAppShell(page);
		runtime.assertClean();
	});

	test('lands on correct content after rapid hops ending on a non-React route', async ({ page }) => {
		const runtime = trackRuntimeErrors(page);

		await gotoAndWait(page, '/react-content');

		const hops = ['/docs', '/react-lab', '/react-content', '/docs'];
		for (const href of hops.slice(0, -1)) {
			await rapidClickHref(page, href);
		}
		await rapidClickHref(page, hops[hops.length - 1], ['primary', 'route'], { requireMatch: true });

		await settleOnRoute({
			page,
			href: '/docs',
			content: page.getByTestId('page-docs'),
			navigate: () => rapidClickHref(page, '/docs', ['primary', 'route'], { requireMatch: true }),
		});
		await assertSingleAppShell(page);
		runtime.assertClean();
	});

	test('lands on correct content after rapid hops ending on a React route', async ({ page }) => {
		const runtime = trackRuntimeErrors(page);

		await gotoAndWait(page, '/docs');

		const hops = ['/react-lab', '/docs', '/react-content', '/react-lab', '/react-content'];
		for (const href of hops.slice(0, -1)) {
			await rapidClickHref(page, href);
		}
		await rapidClickHref(page, hops[hops.length - 1], ['primary', 'route'], { requireMatch: true });

		await settleOnRoute({
			page,
			href: '/react-content',
			content: page.getByTestId('page-react-content'),
			navigate: () => rapidClickHref(page, '/react-content', ['primary', 'route'], { requireMatch: true }),
		});
		await assertSingleAppShell(page);
		runtime.assertClean();
	});
});
