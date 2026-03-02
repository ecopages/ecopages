import { test, expect } from '@playwright/test';

type InjectorMapConfig = Record<string, { value?: string | boolean; scripts: string[] }>;

function parseInjectorMapFromHtml(html: string | null | undefined): InjectorMapConfig {
	expect(html).toBeTruthy();
	const mapMatches = Array.from(html?.matchAll(/<script type="ecopages\/injector-map">([\s\S]*?)<\/script>/g) ?? []);
	expect(mapMatches.length).toBeGreaterThan(0);

	const mergedMap: InjectorMapConfig = {};

	for (const match of mapMatches) {
		const raw = match[1];
		if (!raw) {
			continue;
		}

		const map = JSON.parse(raw) as InjectorMapConfig;

		for (const [trigger, config] of Object.entries(map)) {
			if (!mergedMap[trigger]) {
				mergedMap[trigger] = {
					value: config.value,
					scripts: [...config.scripts],
				};
				continue;
			}

			mergedMap[trigger] = {
				value: mergedMap[trigger].value ?? config.value,
				scripts: Array.from(new Set([...mergedMap[trigger].scripts, ...config.scripts])),
			};
		}
	}

	return mergedMap;
}

test.describe('Lazy Dependencies', () => {
	test.describe('on:interaction (click)', () => {
		test('should not load lazy script before interaction', async ({ page }) => {
			await page.goto('/lazy-deps');
			await page.waitForLoadState('networkidle');

			const sentinel = page.locator('#lazy-script-loaded');
			await expect(sentinel).not.toBeVisible();
		});

		test('should load lazy script after click interaction', async ({ page }) => {
			await page.goto('/lazy-deps');
			await page.waitForLoadState('networkidle');

			const sentinel = page.locator('#lazy-script-loaded');
			await expect(sentinel).not.toBeVisible();

			await page.click('#lazy-trigger');

			await expect(sentinel).toBeVisible({ timeout: 5000 });
			await expect(sentinel).toHaveText('Lazy script loaded!');
		});

		test('should wrap component with scripts-injector element', async ({ page }) => {
			const response = await page.goto('/lazy-deps');
			const html = await response?.text();
			const injectorMap = parseInjectorMapFromHtml(html);

			expect(injectorMap['on:interaction']?.value).toBe('mouseenter,click');
			expect(injectorMap['on:interaction']?.scripts.some((script) => script.includes('/lazy-script'))).toBe(true);
		});
	});

	test.describe('on:visible', () => {
		test('should not load visible script before scrolling into view', async ({ page }) => {
			await page.goto('/lazy-deps');
			await page.waitForLoadState('networkidle');

			const sentinel = page.locator('#visible-script-loaded');
			await expect(sentinel).not.toBeVisible();
		});

		test('should load visible script when component enters viewport', async ({ page }) => {
			await page.goto('/lazy-deps');
			await page.waitForLoadState('networkidle');

			const sentinel = page.locator('#visible-script-loaded');
			await expect(sentinel).not.toBeVisible();

			await page.evaluate(() => {
				document.querySelector('#below-fold-section')?.scrollIntoView();
			});

			await expect(sentinel).toBeVisible({ timeout: 5000 });
			await expect(sentinel).toHaveText('Visible script loaded!');
		});

		test('should wrap component with scripts-injector on:visible attribute', async ({ page }) => {
			const response = await page.goto('/lazy-deps');
			const html = await response?.text();
			const injectorMap = parseInjectorMapFromHtml(html);

			expect(injectorMap['on:visible']).toBeDefined();
			expect(injectorMap['on:visible']?.scripts.some((script) => script.includes('/lazy-visible.script'))).toBe(
				true,
			);
		});
	});

	test.describe('on:idle', () => {
		test('should load idle script when browser becomes idle', async ({ page }) => {
			await page.goto('/lazy-deps');
			await page.waitForLoadState('networkidle');

			const sentinel = page.locator('#idle-script-loaded');
			await expect(sentinel).toBeVisible({ timeout: 5000 });
			await expect(sentinel).toHaveText('Idle script loaded!');
		});

		test('should wrap component with scripts-injector on:idle attribute', async ({ page }) => {
			const response = await page.goto('/lazy-deps');
			const html = await response?.text();
			const injectorMap = parseInjectorMapFromHtml(html);

			expect(injectorMap['on:idle']).toBeDefined();
			expect(injectorMap['on:idle']?.scripts.some((script) => script.includes('/lazy-idle.script'))).toBe(true);
		});
	});

	test.describe('HTML output', () => {
		test('should not include lazy scripts in initial page HTML', async ({ page }) => {
			const response = await page.goto('/lazy-deps');
			const html = await response?.text();

			expect(html).not.toContain('lazy-script-loaded');
			expect(html).not.toContain('visible-script-loaded');
			expect(html).not.toContain('idle-script-loaded');

			const lazyScriptTags = html?.match(/<script[^>]*src="[^"]*lazy-(script|visible|idle)[^"]*"[^>]*>/g);
			expect(lazyScriptTags).toBeNull();
		});

		test('should include scripts-injector in page dependencies', async ({ page }) => {
			const response = await page.goto('/lazy-deps');
			const html = await response?.text();

			expect(html).toContain('scripts-injector');
		});
	});
});
