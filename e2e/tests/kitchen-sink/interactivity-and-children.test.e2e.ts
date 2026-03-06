import { expect, test, type Locator, type Page } from '@playwright/test';

async function assertCounterInteractivity(root: Locator) {
	await expect(root.locator('[data-kita-value]')).toHaveText('0');
	await root.locator('[data-kita-inc]').click();
	await expect(root.locator('[data-kita-value]')).toHaveText('1');

	await expect(root.locator('[data-lit-value]').first()).toHaveText('0');
	await root.locator('[data-lit-inc]').first().click();
	await expect(root.locator('[data-lit-value]').first()).toHaveText('1');

	await expect(root.locator('[data-react-value]')).toHaveText('0');
	await root.locator('[data-react-inc]').click();
	await expect(root.locator('[data-react-value]')).toHaveText('1');
}

function getSectionByHeading(page: Page, heading: string): Locator {
	return page
		.locator('section')
		.filter({ has: page.getByRole('heading', { name: heading, exact: true }) })
		.first();
}

test.describe('Kitchen Sink Integrations', () => {
	test('supports cross-integration children and interactivity', async ({ page }) => {
		const pageErrors: string[] = [];
		const consoleErrors: string[] = [];

		page.on('pageerror', (error) => {
			pageErrors.push(error.message);
		});
		page.on('console', (msg) => {
			if (msg.type() === 'error') {
				consoleErrors.push(msg.text());
			}
		});

		await page.goto('/');
		await page.waitForLoadState('networkidle');

		await expect(page.locator('[data-react-shell="kita-react-child"]').first()).toBeVisible();
		await expect(page.locator('[data-cross-child="lit-root"]')).toHaveText('lit-root-child');
		await expect(page.locator('[data-react-shell="react-root"] [data-react-shell-child]')).toHaveText(
			'react-root-child',
		);

		await expect(page.locator('[data-kita-shell="kita-root"] [data-lit-shell="kita-lit-child"]')).toBeVisible();
		await expect(page.locator('[data-lit-shell="lit-root"] [data-kita-shell="lit-kita-child"]')).toBeVisible();
		await expect(page.locator('[data-react-shell="react-root"]').first()).toBeVisible();
		await expect(page.locator('[data-react-mdx] h1').first()).toHaveText('React MDX Block');

		await assertCounterInteractivity(getSectionByHeading(page, 'Counters'));

		const html = await page.content();
		expect(html.includes('<eco-marker')).toBe(false);

		const combinedErrors = `${pageErrors.join('\n')}\n${consoleErrors.join('\n')}`;
		expect(combinedErrors).not.toMatch(/is not defined/i);
		expect(combinedErrors).not.toMatch(/Cannot set properties of null/i);
		expect(combinedErrors).not.toMatch(/Missing props reference/i);
	});

	test('renders full integration matrix on lit entry route', async ({ page }) => {
		await page.goto('/lit-entry');
		await page.waitForLoadState('networkidle');
		await expect(page.getByRole('heading', { name: 'Lit Entry' })).toBeVisible();
		await expect(page.locator('[data-cross-child="lit-entry"]')).toHaveText('lit-entry-child');
		await expect(page.locator('[data-lit-shell="lit-entry-root"]')).toBeVisible();
		await expect(page.locator('[data-kita-shell="lit-entry-kita-child"]')).toBeVisible();
		await expect(page.locator('[data-react-shell="lit-entry-react-child"]').first()).toBeVisible();
		await expect(page.locator('[data-react-mdx] h1').first()).toHaveText('React MDX Block');
		await assertCounterInteractivity(getSectionByHeading(page, 'Counters'));
	});

	test('renders full integration matrix on react entry route', async ({ page }) => {
		await page.goto('/react-entry');
		await page.waitForLoadState('networkidle');
		await expect(page.getByRole('heading', { name: 'React Entry' })).toBeVisible();
		await expect(page.locator('[data-cross-child="react-entry"]')).toHaveText('react-entry-nested-child');
		await expect(page.locator('[data-react-shell="react-entry-root"]').first()).toBeVisible();
		await expect(page.locator('[data-kita-shell="react-entry-kita-child"]')).toBeVisible();
		await expect(page.locator('[data-lit-shell="react-entry-lit-child"]')).toBeVisible();
		await expect(page.locator('[data-react-mdx] h1').first()).toHaveText('React MDX Block');
		await assertCounterInteractivity(getSectionByHeading(page, 'Counters'));
	});

	test('renders MDX through react integration', async ({ page }) => {
		const pageErrors: string[] = [];
		const consoleErrors: string[] = [];

		page.on('pageerror', (error) => {
			pageErrors.push(error.message);
		});
		page.on('console', (msg) => {
			if (msg.type() === 'error') {
				consoleErrors.push(msg.text());
			}
		});

		await page.goto('/react-entry');
		await page.waitForLoadState('networkidle');

		await expect(page.getByRole('heading', { name: 'React Entry' })).toBeVisible();
		await expect(page.locator('[data-react-mdx] h1').first()).toHaveText('React MDX Block');
		await expect(page.locator('[data-react-mdx]').first()).toContainText(
			'This markdown is rendered through the React integration MDX pipeline.',
		);
		const mdxBlock = page.locator('[data-react-mdx]').first();
		await expect(mdxBlock.locator('[data-lit-value]').first()).toHaveText('0');
		await mdxBlock.locator('[data-lit-inc]').first().click();
		await expect(mdxBlock.locator('[data-lit-value]').first()).toHaveText('1');

		const combinedErrors = `${pageErrors.join('\n')}\n${consoleErrors.join('\n')}`;
		expect(combinedErrors).not.toMatch(/is not defined/i);
		expect(combinedErrors).not.toMatch(/Cannot set properties of null/i);
	});
});
