import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from '../../app-fixture';

/** The `class` attribute of the element with `data-testid`, from the HTML text the server sent. */
function classInServerHtml(html: string, testId: string): string | undefined {
	const tag = new RegExp(`<[^>]*data-testid="${testId}"[^>]*>`).exec(html)?.[0];
	return /\sclass="([^"]*)"/.exec(tag ?? '')?.[1];
}

/** Waits until the React island responds, which means it hydrated. */
async function waitForHydration(page: Page) {
	await page.getByTestId('react-button').click();
	await expect(page.getByTestId('react-button')).toContainText('React 1');
}

test.describe('CSS Modules under ecopages dev', () => {
	test('the server HTML and the hydrated page use the same scoped class names', async ({ page, request }) => {
		const html = await (await request.get('/')).text();
		await page.goto('/');
		await waitForHydration(page);
		await page.getByTestId('kit-button').click();
		await expect(page.getByTestId('kit-button')).toContainText('Kit 1');

		const kit = classInServerHtml(html, 'kit-button');
		expect(kit, 'the package CSS Module has no scoped class in the server HTML').toMatch(/\w+_kit/);
		await expect(page.getByTestId('kit-button')).toHaveAttribute('class', kit!);
		await page.getByTestId('kit-lib-react').click();
		await expect(page.getByTestId('kit-lib-react')).toContainText('Kit lib 1');
		for (const testId of ['kit-lib-eco', 'kit-lib-react']) {
			expect(classInServerHtml(html, testId), `${testId} has another class than the package CSS Module`).toBe(
				kit,
			);
			await expect(page.getByTestId(testId)).toHaveAttribute('class', kit!);
			await expect(page.getByTestId(testId)).toHaveCSS('color', 'rgb(128, 0, 128)');
		}
		const badge = classInServerHtml(html, 'eco-jsx-badge');
		expect(badge, 'Eco JSX has no scoped class in the server HTML').toMatch(/\w+_label \w+_badge/);
		await expect(page.getByTestId('eco-jsx-badge')).toHaveAttribute('class', badge!);
		const button = classInServerHtml(html, 'react-button');
		expect(button, 'the React island has no scoped class in the server HTML').toMatch(/\w+_primary/);
		await expect(page.getByTestId('react-button')).toHaveAttribute('class', button!);
	});

	test('the Lit component the server rendered and the element the browser defined use the same class name', async ({
		page,
		request,
	}) => {
		const html = await (await request.get('/lit')).text();
		await page.goto('/lit');
		await page.getByTestId('lit-card').click();
		await expect(page.getByTestId('lit-card')).toContainText('Lit 1');

		const server = classInServerHtml(html, 'lit-card-host');
		expect(server, 'the Lit component has no scoped class in the server HTML').toMatch(/\w+_card/);
		await expect(page.getByTestId('lit-card-host')).toHaveAttribute('class', server!);
		await expect(page.getByTestId('lit-card')).toHaveAttribute('class', server!);
	});

	test('links the scoped CSS that styles the Eco JSX component and the React island', async ({ page }) => {
		await page.goto('/');
		await waitForHydration(page);

		await expect(page.getByTestId('eco-jsx-badge')).toHaveCSS('color', 'rgb(0, 128, 0)');
		await expect(page.getByTestId('react-button')).toHaveCSS('color', 'rgb(0, 0, 255)');
		await expect(page.getByTestId('kit-button')).toHaveCSS('color', 'rgb(128, 0, 128)');
	});

	test('a CSS-only edit refreshes the stylesheet in place and keeps the page and its class names', async ({
		page,
		app,
	}) => {
		await page.goto('/');
		await waitForHydration(page);
		await page.evaluate(() => ((window as unknown as { __kept: boolean }).__kept = true));
		const className = await page.getByTestId('react-button').getAttribute('class');
		const file = path.join(app.dir, 'src/components/button.module.css');

		writeFileSync(file, readFileSync(file, 'utf8').replace('rgb(0, 0, 255)', 'rgb(255, 0, 0)'));

		await expect(page.getByTestId('react-button')).toHaveCSS('color', 'rgb(255, 0, 0)', { timeout: 30_000 });
		await expect(page.getByTestId('react-button')).toHaveAttribute('class', className!);
		await expect(page.getByTestId('react-button')).toContainText('React 1');
		expect(await page.evaluate(() => (window as unknown as { __kept?: boolean }).__kept)).toBe(true);
	});

	test('an edit that changes the class map reaches the island without a reload', async ({ page, app }) => {
		await page.goto('/');
		await waitForHydration(page);
		await page.evaluate(() => ((window as unknown as { __kept: boolean }).__kept = true));
		await expect(page.getByTestId('react-button')).toHaveAttribute('data-classes', 'primary');
		const file = path.join(app.dir, 'src/components/button.module.css');

		writeFileSync(file, `${readFileSync(file, 'utf8')}\n.secondary {\n\tcolor: rgb(0, 128, 0);\n}\n`);

		await expect(page.getByTestId('react-button')).toHaveAttribute('data-classes', 'primary,secondary', {
			timeout: 30_000,
		});
		expect(await page.evaluate(() => (window as unknown as { __kept?: boolean }).__kept)).toBe(true);
	});

	test('keeps the last good stylesheet while a CSS Module is broken and recovers when a save fixes it', async ({
		page,
		app,
	}) => {
		await page.goto('/');
		await waitForHydration(page);
		const file = path.join(app.dir, 'src/components/button.module.css');
		const good = readFileSync(file, 'utf8');

		writeFileSync(file, `${good}\n}\n`);
		await expect.poll(() => app.getServerOutput(), { timeout: 30_000 }).toContain('Failed to process stylesheet');
		await expect(page.getByTestId('react-button')).toHaveCSS('color', 'rgb(0, 0, 255)');

		writeFileSync(file, good.replace('rgb(0, 0, 255)', 'rgb(255, 0, 0)'));

		await expect(page.getByTestId('react-button')).toHaveCSS('color', 'rgb(255, 0, 0)', { timeout: 30_000 });
	});

	test('answers a page request 200 with the last good stylesheet and the error overlay while a CSS Module is broken', async ({
		page,
		request,
		app,
	}) => {
		await page.goto('/');
		await waitForHydration(page);
		const file = path.join(app.dir, 'src/components/button.module.css');
		const good = readFileSync(file, 'utf8');
		const overlay = page.locator('#__ecopages_build_error__');

		writeFileSync(file, `${good}\n}\n`);
		await expect(overlay).toBeVisible({ timeout: 30_000 });

		const response = await request.get('/');
		expect(response.status()).toBe(200);
		await page.reload();
		await expect(overlay).toBeVisible({ timeout: 30_000 });
		await expect(page.getByTestId('react-button')).toHaveCSS('color', 'rgb(0, 0, 255)');

		writeFileSync(file, good.replace('rgb(0, 0, 255)', 'rgb(255, 0, 0)'));

		await expect(overlay).toBeHidden({ timeout: 30_000 });
		await expect(page.getByTestId('react-button')).toHaveCSS('color', 'rgb(255, 0, 0)', { timeout: 30_000 });
	});

	test('answers a page request 200 with the last good script and the error overlay while a script is broken', async ({
		page,
		request,
		app,
	}) => {
		await page.goto('/lit');
		await page.getByTestId('lit-card').click();
		await expect(page.getByTestId('lit-card')).toContainText('Lit 1');
		const file = path.join(app.dir, 'src/components/card.script.ts');
		const good = readFileSync(file, 'utf8');
		const overlay = page.locator('#__ecopages_build_error__');

		writeFileSync(file, `${good}\nexport const broken = ;\n`);
		await expect(overlay).toBeVisible({ timeout: 30_000 });

		const response = await request.get('/lit');
		expect(response.status()).toBe(200);
		await page.reload();
		await expect(overlay).toBeVisible({ timeout: 30_000 });
		await expect(overlay).toContainText('card.script.ts');
		await page.getByTestId('lit-card').click();
		await expect(page.getByTestId('lit-card')).toContainText('Lit 1');

		writeFileSync(file, good.replace('this.count += 1', 'this.count += 2'));

		await expect(overlay).toBeHidden({ timeout: 30_000 });
		await expect(async () => {
			await page.reload();
			await page.getByTestId('lit-card').click();
			await expect(page.getByTestId('lit-card')).toContainText('Lit 2', { timeout: 2_000 });
		}).toPass({ timeout: 30_000 });
		expect(await (await request.get('/lit')).text()).toContain('shadowrootmode');
	});
});
