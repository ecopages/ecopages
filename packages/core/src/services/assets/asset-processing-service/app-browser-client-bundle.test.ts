import { describe, expect, test } from 'vitest';
import { APP_BROWSER_CLIENT_BUNDLE_ID, createAppBrowserClientEntry } from './app-browser-client-bundle.ts';

describe('createAppBrowserClientEntry', () => {
	test('lazy entries are a side-effect import of the source module', () => {
		const entry = createAppBrowserClientEntry({
			entryName: 'ecopages-kitajs-lazy-abc',
			importPath: '/app/src/components/table.client.ts',
		});

		expect(entry.content).toBe('import "/app/src/components/table.client.ts";');
		expect(entry.groupedBundle).toEqual({
			id: APP_BROWSER_CLIENT_BUNDLE_ID,
			entryName: 'ecopages-kitajs-lazy-abc',
		});
	});

	test('reexport entries keep named exports for island hydration without a synthetic default', () => {
		const importPath = '/app/src/components/react-counter.react.tsx';
		const entry = createAppBrowserClientEntry({
			entryName: 'ecopages-react-island-123',
			importPath,
			reexport: true,
		});

		expect(entry.content).toBe(`export * from ${JSON.stringify(importPath)};`);
		expect(entry.content).not.toContain('export default');
	});
});
