import { expect, type Page } from '@playwright/test';

export const WORKER_PAGES = ['/', '/dynamic'] as const;

/** Opens `pathname` and waits for the reply its Page script's module worker posts back. */
export async function expectWorkerReply(page: Page, pathname: string): Promise<void> {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));

	await page.goto(pathname);

	await expect(page.locator('[data-worker-reply]')).toHaveText('reply: ping from worker');
	expect(errors).toEqual([]);
}
