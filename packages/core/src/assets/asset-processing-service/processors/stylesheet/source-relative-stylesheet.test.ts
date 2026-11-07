import { describe, expect, it } from 'vitest';
import { sourceRelativeStylesheetHref } from './source-relative-stylesheet.ts';

const dirs = { srcDir: '/app/src', distDir: '/app/.eco/dist/client' };

describe('sourceRelativeStylesheetHref', () => {
	it('names the source-relative href of a stylesheet inside srcDir, apart from a same-named one elsewhere', () => {
		expect(sourceRelativeStylesheetHref(dirs, '/app/src/a/style.css')).toBe('/assets/a/style.css');
		expect(sourceRelativeStylesheetHref(dirs, '/app/src/b/style.css')).toBe('/assets/b/style.css');
	});

	it('names the .css output of a stylesheet with another extension', () => {
		expect(sourceRelativeStylesheetHref(dirs, '/app/src/card.scss')).toBe('/assets/card.scss.css');
	});

	it('names none for a stylesheet outside srcDir', () => {
		expect(sourceRelativeStylesheetHref(dirs, '/app/vendor/theme.css')).toBeUndefined();
	});
});
