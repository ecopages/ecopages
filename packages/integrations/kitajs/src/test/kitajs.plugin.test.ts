import { describe, expect, it } from 'vitest';
import { KitaHtmlPlugin } from '../kitajs.plugin.ts';

describe('KitaHtmlPlugin', () => {
	it('exposes the Kita JSX runtime contract', () => {
		const plugin = new KitaHtmlPlugin();

		expect(plugin.name).toBe('kitajs');
		expect(plugin.extensions).toEqual(['.kita.tsx']);
		expect(plugin.jsxImportSource).toBe('@kitajs/html');
	});
});
