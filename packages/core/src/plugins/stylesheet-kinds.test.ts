import { describe, expect, it } from 'vitest';
import { Processor, type ProcessorAssetCapability } from './processor.ts';
import {
	createStylesheetKinds,
	findStylesheetProcessor,
	getStylesheetKinds,
	isEmittableReferenceFile,
	PLAIN_CSS_KINDS,
} from './stylesheet-kinds.ts';
import { serializeStylesheetModuleDeclarations } from './processor.ts';

class FixtureProcessor extends Processor {
	constructor(name: string, capabilities: ProcessorAssetCapability[]) {
		super({ name, capabilities });
	}
	async setup(): Promise<void> {}
}

const sass = () => new FixtureProcessor('sass', [{ kind: 'stylesheet', extensions: ['*.scss'] }]);

describe('createStylesheetKinds, for CSS Modules', () => {
	it('reports a Processor that declares cssModules as scoping them', () => {
		const scoping = new FixtureProcessor('scoping', [
			{ kind: 'stylesheet', extensions: ['*.css'], cssModules: true },
		]);
		expect(createStylesheetKinds([scoping]).scopesCssModules).toBe(true);
	});

	it('reports no scoping without the declaration, or without a stylesheet Processor', () => {
		const plain = new FixtureProcessor('plain', [{ kind: 'stylesheet', extensions: ['*.css'] }]);
		expect(createStylesheetKinds([plain]).scopesCssModules).toBe(false);
		expect(createStylesheetKinds([]).scopesCssModules).toBe(false);
		expect(PLAIN_CSS_KINDS.scopesCssModules).toBe(false);
	});

	it('ignores cssModules on a capability that is not a stylesheet one', () => {
		const images = new FixtureProcessor('images', [{ kind: 'image', extensions: ['*.png'], cssModules: true }]);
		expect(createStylesheetKinds([images]).scopesCssModules).toBe(false);
	});
});

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
		expect(kinds.isCssModule('./card.module.scss')).toBe(false);
		expect(kinds.isCssModule('./card.scss')).toBe(false);
	});

	it('takes *.module.<ext> as a CSS Module when the capability declaring <ext> sets cssModules', () => {
		const kinds = createStylesheetKinds([
			new FixtureProcessor('sass', [{ kind: 'stylesheet', extensions: ['*.scss'], cssModules: true }]),
		]);
		expect(kinds.isCssModule('./card.module.scss')).toBe(true);
		expect(kinds.isCssModule('./card.module.SCSS')).toBe(true);
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

describe('CSS Module detection and generated declarations', () => {
	const capabilitySets: Array<[string, ProcessorAssetCapability[]]> = [
		[
			'cssModules on .css only',
			[
				{ kind: 'stylesheet', extensions: ['*.css'], cssModules: true },
				{ kind: 'stylesheet', extensions: ['*.scss'] },
			],
		],
		['cssModules on .scss', [{ kind: 'stylesheet', extensions: ['*.css', '*.scss'], cssModules: true }]],
		['cssModules on neither', [{ kind: 'stylesheet', extensions: ['*.css', '*.scss'] }]],
	];

	it('treats *.module.<ext> as a CSS Module only when the capability that declares <ext> sets cssModules', () => {
		const kinds = createStylesheetKinds([new FixtureProcessor('p', capabilitySets[0]![1])]);
		expect(kinds.isCssModule('./card.module.css')).toBe(true);
		expect(kinds.isCssModule('./card.module.scss')).toBe(false);
		expect(kinds.isStylesheet('./card.module.scss')).toBe(true);
	});

	it('agrees with the generated declarations for every capability set', () => {
		for (const [, capabilities] of capabilitySets) {
			const kinds = createStylesheetKinds([new FixtureProcessor('p', capabilities)]);
			const declaresClassMap =
				serializeStylesheetModuleDeclarations(capabilities).includes(`declare module '*.module.scss'`);
			expect(kinds.isCssModule('./card.module.scss')).toBe(declaresClassMap);
		}
	});
});
