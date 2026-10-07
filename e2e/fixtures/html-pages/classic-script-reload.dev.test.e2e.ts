import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { gotoAndWait } from '../../utils/test-helpers';

const GREETING_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'src/pages/classic/greeting.ts');

test('reloads a Page when its classic script changes while a module script is watched', async ({ page }) => {
	const original = readFileSync(GREETING_FILE, 'utf8');
	const main = page.locator('main');

	try {
		await gotoAndWait(page, '/about');
		await expect(page.locator('my-counter button')).toHaveText('Count: 2');

		await gotoAndWait(page, '/landing');
		await expect(main).toHaveAttribute('data-greeting', 'Bonjour Ecopages');
		await page.waitForFunction(
			() => (window as Window & { __ECO_HMR_CONNECTED__?: boolean }).__ECO_HMR_CONNECTED__ === true,
		);

		await writeFile(GREETING_FILE, original.replace('Bonjour', 'Salut'), { flush: true });

		await expect(main).toHaveAttribute('data-greeting', 'Salut Ecopages', { timeout: 15_000 });
	} finally {
		await writeFile(GREETING_FILE, original, { flush: true });
	}
});
