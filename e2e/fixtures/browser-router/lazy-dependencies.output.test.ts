import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { startStaticExport, type StaticExport } from '../../utils/static-export.ts';

type GlobalInjectorRule = { value?: string | boolean; scripts: string[] };
type GlobalInjectorMapConfig = Record<string, Record<string, GlobalInjectorRule>>;
type LazyRuleName = 'on:interaction' | 'on:visible' | 'on:idle';

/** Merges every global injector map the page embeds, so a rule split across several maps is read once. */
function parseInjectorMapFromHtml(html: string): GlobalInjectorMapConfig {
	const mapMatches = Array.from(html.matchAll(/<script type="ecopages\/global-injector-map">([\s\S]*?)<\/script>/g));
	expect(mapMatches.length).toBeGreaterThan(0);

	const mergedMap: GlobalInjectorMapConfig = {};

	for (const match of mapMatches) {
		const map = JSON.parse(match[1] ?? '{}') as GlobalInjectorMapConfig;

		for (const [trigger, rules] of Object.entries(map)) {
			mergedMap[trigger] ??= {};

			for (const [ruleName, config] of Object.entries(rules)) {
				const existingRule = mergedMap[trigger][ruleName];
				mergedMap[trigger][ruleName] = {
					value: existingRule?.value ?? config.value,
					scripts: Array.from(new Set([...(existingRule?.scripts ?? []), ...config.scripts])),
				};
			}
		}
	}

	return mergedMap;
}

function findRule(map: GlobalInjectorMapConfig, ruleName: LazyRuleName): GlobalInjectorRule | undefined {
	return Object.values(map)
		.map((triggerRules) => triggerRules[ruleName])
		.find(Boolean);
}

describe('Lazy dependencies HTML', () => {
	let site: StaticExport;
	let html: string;

	beforeAll(async () => {
		site = await startStaticExport(import.meta.dirname);
		const response = await fetch(`${site.origin}/lazy-deps`);
		expect(response.status).toBe(200);
		html = await response.text();
	});

	afterAll(async () => {
		await site?.stop();
		vi.unstubAllEnvs();
	});

	it('exposes the interaction trigger in the global injector map', () => {
		const rule = findRule(parseInjectorMapFromHtml(html), 'on:interaction');

		expect(rule?.value).toBe('mouseenter,click');
		expect(rule?.scripts.length).toBeGreaterThan(0);
		expect(rule?.scripts.every((script) => /^\/assets\/.+\.js$/.test(script))).toBe(true);
	});

	it.each(['on:visible', 'on:idle'] as const)('exposes the %s trigger in the global injector map', (ruleName) => {
		const rule = findRule(parseInjectorMapFromHtml(html), ruleName);

		expect(rule).toBeDefined();
		expect(rule?.scripts.length).toBeGreaterThan(0);
		expect(rule?.scripts.every((script) => /^\/assets\/.+\.js$/.test(script))).toBe(true);
	});

	it('does not include lazy scripts in the initial page HTML', () => {
		expect(html).not.toContain('lazy-script-loaded');
		expect(html).not.toContain('visible-script-loaded');
		expect(html).not.toContain('idle-script-loaded');
		expect(html.match(/<script[^>]*src="[^"]*lazy-(script|visible|idle)[^"]*"[^>]*>/g)).toBeNull();
	});

	it('includes the global injector assets in the page dependencies', () => {
		expect(html).toContain('ecopages/global-injector-map');
		expect(html).toContain('__ecoGlobalInjectorCleanup');
	});
});
