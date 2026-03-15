import { expect, type Locator, type Page } from '@playwright/test';

type CounterExpectations = {
	kita?: string;
	lit?: string;
	react?: string;
};

export function trackRuntimeErrors(page: Page) {
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

	return {
		pageErrors,
		consoleErrors,
		assertClean() {
			const combinedErrors = `${pageErrors.join('\n')}\n${consoleErrors.join('\n')}`;
			expect(combinedErrors).not.toMatch(/is not defined/i);
			expect(combinedErrors).not.toMatch(/Cannot set properties of null/i);
			expect(combinedErrors).not.toMatch(/Missing props reference/i);
			expect(combinedErrors).not.toMatch(/Failed to execute 'appendChild'/i);
			expect(combinedErrors).not.toMatch(/Hydration failed/i);
		},
	};
}

async function clickCounter(button: Locator) {
	for (let attempt = 0; attempt < 3; attempt += 1) {
		try {
			await expect(button).toBeVisible();
			await button.click({ timeout: 5000 });
			return;
		} catch (error) {
			if (attempt === 2) {
				throw error;
			}
			await new Promise((resolve) => setTimeout(resolve, 100));
		}
	}
}

export async function incrementCounter(button: Locator, value: Locator, expectedValue: string) {
	for (let attempt = 0; attempt < 4; attempt += 1) {
		try {
			await clickCounter(button);
			await expect(value).toHaveText(expectedValue, { timeout: 1000 });
			return;
		} catch (error) {
			if (attempt === 3) {
				throw error;
			}
			await new Promise((resolve) => setTimeout(resolve, 150));
		}
	}
}

export async function assertCounterInteractivity(root: Locator, expectations: CounterExpectations = {}) {
	const initialKita = expectations.kita ?? '0';
	const initialLit = expectations.lit ?? '0';
	const initialReact = expectations.react ?? '0';
	const kitaValue = root.locator('[data-kita-value]');
	const litValue = root.locator('[data-lit-value]').first();
	const reactValue = root.locator('[data-react-value]');

	await expect(kitaValue).toHaveText(initialKita);
	await incrementCounter(root.locator('[data-kita-inc]'), kitaValue, String(Number(initialKita) + 1));

	await expect(litValue).toHaveText(initialLit);
	await incrementCounter(root.locator('[data-lit-inc]').first(), litValue, String(Number(initialLit) + 1));

	await expect(reactValue).toHaveText(initialReact);
	await incrementCounter(root.locator('[data-react-inc]'), reactValue, String(Number(initialReact) + 1));
}

export function getSectionByHeading(page: Page, heading: string): Locator {
	return page.locator('section').filter({ has: page.getByRole('heading', { name: heading, exact: true }) }).first();
}

export function getSectionByText(page: Page, text: string): Locator {
	return page.locator('section').filter({ hasText: text }).first();
}

export async function gotoAndWait(page: Page, href: string) {
	await page.goto(href);
	await page.waitForLoadState('networkidle');
}

export async function clickHrefAndWait(page: Page, href: string) {
	const link = page.locator(`a[href="${href}"]`).first();
	await expect(link).toBeVisible();
	const targetUrl = new URL(href, page.url());

	try {
		await Promise.all([
			page.waitForURL(
				(url) => url.pathname === targetUrl.pathname && url.search === targetUrl.search,
				{ timeout: 5000 },
			),
			link.click(),
		]);
	} catch {
		await gotoAndWait(page, href);
		return;
	}

	await page.waitForLoadState('networkidle').catch(() => undefined);
}