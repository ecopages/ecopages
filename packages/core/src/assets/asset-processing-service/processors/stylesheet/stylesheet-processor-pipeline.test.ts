import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { path } from '@ecopages/file-system/path';
import { afterEach, describe, expect, it } from 'vitest';
import type { EcoPagesAppConfig } from '../../../../config/internal-types.ts';
import { Processor } from '../../../../plugins/processor.ts';
import { applyStylesheetProcessors } from './stylesheet-processor-pipeline.ts';

class FixtureStylesheetProcessor extends Processor {
	async setup(): Promise<void> {}
	override async transformStylesheet(css: string): Promise<{ css: string }> {
		return { css: `${css}\n/* processed */` };
	}
}

function configWith(extensions: string[] | undefined): EcoPagesAppConfig {
	const processors = new Map<string, Processor>();
	if (extensions) {
		processors.set(
			'sass',
			new FixtureStylesheetProcessor({ name: 'sass', capabilities: [{ kind: 'stylesheet', extensions }] }),
		);
	}
	return { processors } as unknown as EcoPagesAppConfig;
}

describe('applyStylesheetProcessors', () => {
	it('processes an extension the stylesheet Processor declares', async () => {
		const config = configWith(['*.scss']);
		expect(await applyStylesheetProcessors(config, '.a {}', '/app/card.scss')).toEqual({
			css: '.a {}\n/* processed */',
			dependencies: [],
		});
	});

	it('passes a stylesheet through when no Processor is registered', async () => {
		const config = configWith(undefined);
		expect(await applyStylesheetProcessors(config, '.a {}', '/app/card.css')).toEqual({
			css: '.a {}',
			dependencies: [],
		});
		expect(await applyStylesheetProcessors(config, '.a {}', '/app/card.scss')).toEqual({
			css: '.a {}',
			dependencies: [],
		});
	});

	it('skips a Processor that has no transformStylesheet', async () => {
		class Hookless extends Processor {
			async setup(): Promise<void> {}
		}
		const processors = new Map([
			['h', new Hookless({ name: 'h', capabilities: [{ kind: 'stylesheet', extensions: ['*.scss'] }] })],
		]);
		const config = { processors } as unknown as EcoPagesAppConfig;
		expect(await applyStylesheetProcessors(config, '.a {}', '/app/card.scss')).toEqual({
			css: '.a {}',
			dependencies: [],
		});
	});

	it('keeps the stylesheets the transform read, once each, and drops the file itself and content files', async () => {
		class InliningProcessor extends Processor {
			async setup(): Promise<void> {}

			override async transformStylesheet(css: string) {
				return {
					css,
					dependencies: ['/app/partials/../base.scss', '/app/base.scss', '/app/card.scss', '/app/page.tsx'],
				};
			}
		}
		const processors = new Map([
			['i', new InliningProcessor({ name: 'i', capabilities: [{ kind: 'stylesheet', extensions: ['*.scss'] }] })],
		]);
		const config = { processors } as unknown as EcoPagesAppConfig;
		expect(await applyStylesheetProcessors(config, '.a {}', '/app/card.scss')).toEqual({
			css: '.a {}',
			dependencies: [path.resolve('/app/base.scss')],
		});
	});

	it('leaves a file the Processor does not declare alone', async () => {
		const config = configWith(['*.scss']);
		expect(await applyStylesheetProcessors(config, '.a {}', '/app/card.less')).toEqual({
			css: '.a {}',
			dependencies: [],
		});
	});
});

describe('applyStylesheetProcessors inlining app @imports', () => {
	let rootDir: string;
	afterEach(() => rmSync(rootDir, { recursive: true, force: true }));

	function write(name: string, contents: string): string {
		rootDir ??= path.fromNative(realpathSync(mkdtempSync(path.join(tmpdir(), 'stylesheet-pipeline-'))));
		const file = path.join(rootDir, name);
		mkdirSync(path.dirname(file), { recursive: true });
		writeFileSync(file, contents);
		return file;
	}

	it('inlines a relative @import with no Processor and reports the partial as a dependency', async () => {
		const partial = write('a.css', '.a {}');
		const entry = write('main.css', "@import './a.css';\n.main {}");

		expect(await applyStylesheetProcessors(configWith(undefined), "@import './a.css';\n.main {}", entry)).toEqual({
			css: '.a {}\n.main {}',
			dependencies: [partial],
		});
	});

	it('inlines what the Processor left, and keeps the dependencies it reported', async () => {
		const partial = write('a.css', '.a {}');
		const entry = write('main.scss', '');
		const config = configWith(['*.scss']);

		const result = await applyStylesheetProcessors(config, "@import './a.css';", entry);

		expect(result.css).toBe('.a {}\n/* processed */');
		expect(result.dependencies).toEqual([partial]);
	});

	it('leaves a stylesheet without an @import as the cache and the Processor made it', async () => {
		const entry = write('main.css', '.main {}');

		expect(await applyStylesheetProcessors(configWith(undefined), '.main {}', entry)).toEqual({
			css: '.main {}',
			dependencies: [],
		});
	});
});

describe('applyStylesheetProcessors, for a CSS Module', () => {
	class ScopingFixture extends Processor {
		async setup(): Promise<void> {}
		override async transformStylesheet(css: string) {
			return { css: css.replace('.a', '.x_a'), exports: { a: 'x_a' } };
		}
	}
	const withProcessor = (processor: Processor): EcoPagesAppConfig =>
		({ processors: new Map([[processor.name, processor]]) }) as unknown as EcoPagesAppConfig;
	const capable = () =>
		new ScopingFixture({
			name: 'scoping',
			capabilities: [{ kind: 'stylesheet', extensions: ['*.css'], cssModules: true }],
		});

	it('returns the scoped CSS with the class map of the same transform', async () => {
		expect(await applyStylesheetProcessors(withProcessor(capable()), '.a {}', '/app/card.module.css')).toEqual({
			css: '.x_a {}',
			dependencies: [],
			exports: { a: 'x_a' },
		});
	});

	it('gives a stylesheet that is not a CSS Module no exports', async () => {
		const result = await applyStylesheetProcessors(withProcessor(capable()), '.a {}', '/app/card.css');
		expect(result).not.toHaveProperty('exports');
	});

	it('rejects with the package to install when no Processor scopes CSS Modules', async () => {
		const unaware = new FixtureStylesheetProcessor({
			name: 'plain',
			capabilities: [{ kind: 'stylesheet', extensions: ['*.css'] }],
		});
		await expect(
			applyStylesheetProcessors(withProcessor(unaware), '.a {}', '/app/card.module.css'),
		).rejects.toThrow('@ecopages/lightningcss-processor');
		await expect(applyStylesheetProcessors(configWith(undefined), '.a {}', '/app/card.module.css')).rejects.toThrow(
			'/app/card.module.css is a CSS Module',
		);
	});

	it('rejects a Processor that declares cssModules but returns no exports', async () => {
		class Forgetful extends Processor {
			async setup(): Promise<void> {}
			override async transformStylesheet(css: string) {
				return { css };
			}
		}
		const forgetful = new Forgetful({
			name: 'forgetful',
			capabilities: [{ kind: 'stylesheet', extensions: ['*.css'], cssModules: true }],
		});
		await expect(
			applyStylesheetProcessors(withProcessor(forgetful), '.a {}', '/app/card.module.css'),
		).rejects.toThrow('Processor "forgetful" returned no exports');
	});
});
