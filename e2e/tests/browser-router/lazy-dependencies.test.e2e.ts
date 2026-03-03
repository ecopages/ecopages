import { test, expect } from '@playwright/test';

type GlobalInjectorRule = { value?: string | boolean; scripts: string[] };
type GlobalInjectorMapConfig = Record<string, Record<string, GlobalInjectorRule>>;

function parseInjectorMapFromHtml(html: string | null | undefined): GlobalInjectorMapConfig {
	expect(html).toBeTruthy();
	const mapMatches = Array.from(
		html?.matchAll(/<script type="ecopages\/global-injector-map">([\s\S]*?)<\/script>/g) ?? [],
	);
	expect(mapMatches.length).toBeGreaterThan(0);

	const mergedMap: GlobalInjectorMapConfig = {};

	for (const match of mapMatches) {
		const raw = match[1];
		if (!raw) {
			continue;
		}

		const map = JSON.parse(raw) as GlobalInjectorMapConfig;

		for (const [trigger, rules] of Object.entries(map)) {
			if (!mergedMap[trigger]) {
				mergedMap[trigger] = { ...rules };
				continue;
			}

			for (const [ruleName, config] of Object.entries(rules)) {
				const existingRule = mergedMap[trigger][ruleName];
				if (!existingRule) {
					mergedMap[trigger][ruleName] = {
						value: config.value,
						scripts: [...config.scripts],
					};
					continue;
				}

				mergedMap[trigger][ruleName] = {
					value: existingRule.value ?? config.value,
					scripts: Array.from(new Set([...existingRule.scripts, ...config.scripts])),
				};
			}
		}
	}

	return mergedMap;
}

function findRule(
	map: GlobalInjectorMapConfig,
	ruleName: 'on:interaction' | 'on:visible' | 'on:idle',
): GlobalInjectorRule | undefined {
	for (const triggerRules of Object.values(map)) {
		if (triggerRules[ruleName]) {
			return triggerRules[ruleName];
		}
	}

	return undefined;
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

		test('should expose interaction trigger in global injector map', async ({ page }) => {
			const response = await page.goto('/lazy-deps');
			const html = await response?.text();
			const injectorMap = parseInjectorMapFromHtml(html);
			const interactionRule = findRule(injectorMap, 'on:interaction');

			expect(interactionRule?.value).toBe('mouseenter,click');
			expect(interactionRule?.scripts.some((script) => script.includes('/lazy-script'))).toBe(true);
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

		test('should expose visible trigger in global injector map', async ({ page }) => {
			const response = await page.goto('/lazy-deps');
			const html = await response?.text();
			const injectorMap = parseInjectorMapFromHtml(html);
			const visibleRule = findRule(injectorMap, 'on:visible');

			expect(visibleRule).toBeDefined();
			expect(visibleRule?.scripts.some((script) => script.includes('/lazy-visible.script'))).toBe(true);
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

		test('should expose idle trigger in global injector map', async ({ page }) => {
			const response = await page.goto('/lazy-deps');
			const html = await response?.text();
			const injectorMap = parseInjectorMapFromHtml(html);
			const idleRule = findRule(injectorMap, 'on:idle');

			expect(idleRule).toBeDefined();
			expect(idleRule?.scripts.some((script) => script.includes('/lazy-idle.script'))).toBe(true);
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

		test('should include global injector assets in page dependencies', async ({ page }) => {
			const response = await page.goto('/lazy-deps');
			const html = await response?.text();

			expect(html).toContain('ecopages/global-injector-map');
			expect(html).toContain('ecopages-global-injector-bootstrap');
		});
	});
});
