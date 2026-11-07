import { expect, test } from '@playwright/test';
import { gotoPathSimple } from './test-support';

const COMPILED_APPLY = /user-select:\s*none/;

test.describe('Lit imported stylesheet @content', () => {
	test('server-renders the compiled CSS an ssr: true Lit component imports, and hydrates with the same CSS', async ({
		page,
	}) => {
		const html = await (await page.request.get('/discovery')).text();
		const shadowStyle =
			/<discovery-counter[^>]*>\s*<template shadowrootmode="open"[^>]*>\s*<style>([\s\S]*?)<\/style>/.exec(
				html,
			)?.[1];

		expect(shadowStyle).toMatch(COMPILED_APPLY);
		expect(shadowStyle).not.toContain('@apply');

		await gotoPathSimple(page, '/discovery');
		const counter = page.locator('discovery-counter').first();
		await counter.scrollIntoViewIfNeeded();
		await expect.poll(() => page.evaluate(() => Boolean(customElements.get('discovery-counter')))).toBe(true);
		const hydratedCss = await counter.evaluate((element) => {
			const root = element.shadowRoot;
			if (!root) return '';
			const adopted = root.adoptedStyleSheets.flatMap((sheet) => [...sheet.cssRules].map((rule) => rule.cssText));
			const inline = [...root.querySelectorAll('style')].map((style) => style.textContent ?? '');
			return [...adopted, ...inline].join('\n');
		});

		expect(hydratedCss).toMatch(COMPILED_APPLY);
		expect(hydratedCss).not.toContain('@apply');
	});
});
