import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '../../app-fixture';
import { gotoAndWait } from '../../utils/test-helpers';

test('reloads a Page when its classic script changes while a module script is watched', async ({ page, app }) => {
	const greetingFile = path.join(app.dir, 'src/pages/classic/greeting.ts');
	const original = readFileSync(greetingFile, 'utf8');
	const main = page.locator('main');

	try {
		await gotoAndWait(page, '/about');
		await expect(page.locator('my-counter button')).toHaveText('Count: 2');

		await gotoAndWait(page, '/landing');
		await expect(main).toHaveAttribute('data-greeting', 'Bonjour Ecopages');
		await page.waitForFunction(
			() => (window as Window & { __ECO_HMR_CONNECTED__?: boolean }).__ECO_HMR_CONNECTED__ === true,
		);

		await writeFile(greetingFile, original.replace('Bonjour', 'Salut'), { flush: true });

		await expect(main).toHaveAttribute('data-greeting', 'Salut Ecopages', { timeout: 15_000 });
	} finally {
		await writeFile(greetingFile, original, { flush: true });
	}
});
