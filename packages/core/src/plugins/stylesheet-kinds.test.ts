import { describe, expect, it } from 'vitest';
import { Processor, type ProcessorAssetCapability } from './processor.ts';
import {
	createStylesheetKinds,
	findStylesheetProcessor,
	getStylesheetKinds,
	isEmittableReferenceFile,
	PLAIN_CSS_KINDS,
} from './stylesheet-kinds.ts';

class FixtureProcessor extends Processor {
	constructor(name: string, capabilities: ProcessorAssetCapability[]) {
		super({ name, capabilities });
	}
	async setup(): Promise<void> {}
}

const sass = () => new FixtureProcessor('sass', [{ kind: 'stylesheet', extensions: ['*.scss'] }]);

describe('createStylesheetKinds', () => {
	it('knows only .css without a stylesheet Processor', () => {
		const kinds = createStylesheetKinds([
			new FixtureProcessor('images', [{ kind: 'image', extensions: ['*.png'] }]),
		]);
		expect(kinds.extensions).toEqual(['.css']);
		expect(kinds.isStylesheet('./a.css')).toBe(true);
		expect(kinds.isStylesheet('./a.scss')).toBe(false);
		expect(kinds.isCssModule('./a.module.css')).toBe(true);
		expect(kinds.isCssModule('./a.module.scss')).toBe(false);
		expect(PLAIN_CSS_KINDS.extensions).toEqual(['.css']);
	});

	it('adds the extensions the stylesheet Processor declares', () => {
		const kinds = createStylesheetKinds([sass()]);
		expect(kinds.extensions).toEqual(['.css', '.scss']);
		expect(kinds.isStylesheet('./card.scss')).toBe(true);
		expect(kinds.isStylesheet('./card.SCSS')).toBe(true);
		expect(kinds.isStylesheet('./card.less')).toBe(false);
		expect(kinds.isCssModule('./card.module.scss')).toBe(true);
		expect(kinds.isCssModule('./card.scss')).toBe(false);
	});

	it.each([
		[['.sass'], ['.css', '.sass']],
		[['less'], ['.css', '.less']],
		[['*.{ SCSS, Sass }'], ['.css', '.scss', '.sass']],
		[['*'], ['.css']],
		[undefined, ['.css']],
	])('reads the pattern %j', (patterns, expected) => {
		const processor = new FixtureProcessor('p', [{ kind: 'stylesheet', extensions: patterns }]);
		expect(createStylesheetKinds([processor]).extensions).toEqual(expected);
	});

	it('throws naming both when two Processors declare a stylesheet capability', () => {
		const other = new FixtureProcessor('less', [{ kind: 'stylesheet', extensions: ['*.less'] }]);
		expect(() => createStylesheetKinds([sass(), other])).toThrow(/"sass" and "less"/);
	});

	it('reads the registered Processors of an app config', () => {
		const processors = new Map([['sass', sass()]]);
		expect(getStylesheetKinds({ processors }).isStylesheet('a.scss')).toBe(true);
		expect(getStylesheetKinds({ processors: new Map() }).isStylesheet('a.scss')).toBe(false);
	});
});

describe('findStylesheetProcessor', () => {
	it('returns the one stylesheet Processor', () => {
		const processor = sass();
		expect(findStylesheetProcessor([processor])).toBe(processor);
		expect(findStylesheetProcessor([])).toBeUndefined();
	});

	it('throws naming both when two declare a stylesheet capability', () => {
		const other = new FixtureProcessor('less', [{ kind: 'stylesheet', extensions: ['*.less'] }]);
		expect(() => findStylesheetProcessor([sass(), other])).toThrow(/"sass" and "less"/);
	});
});

describe('isEmittableReferenceFile', () => {
	it.each([
		'/a/font.woff2',
		'/a/Hero.PNG',
		'/a/anim.apng',
		'/a/photo.jxl',
		'/a/scan.tif',
		'/a/clip.mov',
		'/a/sound.m4a',
		'/a/icons.svg',
	])('copies %s', (file) => {
		expect(isEmittableReferenceFile(file)).toBe(true);
	});

	it.each(['/a/.env', '/a/.hidden.png', '/a/source.ts', '/a/data.json', '/a/noextension', '/a/style.css'])(
		'does not copy %s',
		(file) => {
			expect(isEmittableReferenceFile(file)).toBe(false);
		},
	);
});
