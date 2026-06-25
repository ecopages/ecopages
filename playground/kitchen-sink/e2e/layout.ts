import { expect } from '@playwright/test';
import type { Page } from 'playwright-core';
import { kitchenSinkShellTestId } from '../src/data/primary-links';

export function getSectionByHeading(page: Page, heading: string) {
	return page
		.locator('section')
		.filter({ has: page.getByRole('heading', { name: heading, exact: true }) })
		.first();
}

export function getSectionByText(page: Page, text: string) {
	return page.locator('section').filter({ hasText: text }).first();
}

export async function readHeaderNavigation(page: Page) {
	return page.locator('header nav a').evaluateAll((links) =>
		links.map((link) => ({
			href: link.getAttribute('href') ?? '',
			label: link.textContent?.trim() ?? '',
		})),
	);
}

export async function assertSingleAppShell(page: Page) {
	await expect(page.getByTestId(kitchenSinkShellTestId)).toBeVisible();
	await expect(page.getByTestId(kitchenSinkShellTestId).locator('header')).toHaveCount(1);
	await expect(page.getByTestId(kitchenSinkShellTestId).locator('main')).toHaveCount(1);
	await expect(page.getByTestId(kitchenSinkShellTestId).locator('footer')).toHaveCount(1);
	await expect(page.getByTestId(kitchenSinkShellTestId).locator('header nav')).toHaveCount(1);
}
