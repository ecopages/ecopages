import fs from 'node:fs';
import os from 'node:os';
import { path } from '@ecopages/file-system/path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { finalizeEcoPagesConfig } from '../../config/assembly/finalize-config.ts';
import type { EcoPagesAppConfig, IClientBridge } from '../../config/internal-types.ts';
import { appLogger } from '../../global/app-logger.ts';
import type { StylesheetInvalidation } from '../../plugins/processor.ts';
import { InliningProcessor } from '../../__fixtures__/stylesheets/inlining-processor.ts';
import { ScopingProcessor } from '../../__fixtures__/stylesheets/scoping-processor.ts';
import { DevelopmentStylesheetService } from './development-stylesheet.service.ts';

/** An {@link InliningProcessor} whose invalidation hook answers `invalidation` and records the files it got. */
class InvalidatingProcessor extends InliningProcessor {
	readonly received: string[][] = [];

	constructor(private readonly invalidation: StylesheetInvalidation | Error) {
		super();
	}

	override invalidateStylesheets(files: readonly string[]): StylesheetInvalidation {
		this.received.push([...files]);
		if (this.invalidation instanceof Error) throw this.invalidation;
		return this.invalidation;
	}
}

let rootDir: string;

function write(relativePath: string, contents: string): string {
	const file = path.join(rootDir, relativePath);
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, contents);
	return file;
}

function persisted(relativeToAssets: string): string | undefined {
	const file = path.join(rootDir, 'dist', 'client', 'assets', relativeToAssets);
	return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : undefined;
}

async function createService(processor: InliningProcessor | null = new InliningProcessor()) {
	const config: EcoPagesAppConfig = await finalizeEcoPagesConfig({
		rootDir,
		integrations: [],
		processors: processor ? [processor] : [],
	});
	return new DevelopmentStylesheetService(config);
}

function createBridge() {
	const cssUpdate = vi.fn<(file: string) => void>();
	const error = vi.fn<(message: string) => void>();
	const bridge = { cssUpdate, error } as unknown as IClientBridge;
	return { bridge, cssUpdate, error };
}

const changed = (...files: string[]) => ({ created: [], changed: files, deleted: [] });

beforeEach(() => {
	rootDir = path.fromNative(fs.mkdtempSync(path.join(os.tmpdir(), 'development-stylesheets-')));
	vi.stubEnv('NODE_ENV', 'development');
});

afterEach(() => {
	fs.rmSync(rootDir, { recursive: true, force: true });
});

describe('DevelopmentStylesheetService', () => {
	it('prewarms the stylesheets in srcDir at their source-relative href, leaving the public directory alone', async () => {
		write('src/styles/main.css', '.main { color: red; }\n');
		write('src/public/vendor.css', '.vendor { color: red; }\n');
		write('src/styles/theme.scss', '.theme { color: red; }\n');
		const service = await createService();

		await service.prewarm();

		expect(persisted('styles/main.css')).toBe('.main { color: red; }\n');
		expect(persisted('public/vendor.css')).toBeUndefined();
		expect(persisted('styles/theme.scss.css')).toBeUndefined();
	});

	it('logs a stylesheet that fails to prewarm and goes on with the others', async () => {
		const broken = write('src/styles/a-broken.css', '.broken {\n');
		write('src/styles/b-good.css', '.good { color: red; }\n');
		const logError = vi.spyOn(appLogger, 'error').mockReturnValue(appLogger);
		const service = await createService();

		await service.prewarm();

		expect(persisted('styles/b-good.css')).toBe('.good { color: red; }\n');
		expect(logError).toHaveBeenCalledWith(expect.stringContaining(broken));
	});

	it('rebuilds a created stylesheet, retries the one that failed on its missing import, and drops a deleted one', async () => {
		const main = write('src/styles/main.css', "@import './tokens.css';\n");
		const old = write('src/styles/old.css', '.old {}\n');
		vi.spyOn(appLogger, 'error').mockReturnValue(appLogger);
		const service = await createService();
		await service.prewarm();
		const { bridge, cssUpdate } = createBridge();

		const tokens = write('src/styles/tokens.css', ':root { --c: red; }\n');
		fs.rmSync(old);
		const restyled = await service.applyChanges({ created: [tokens], changed: [], deleted: [old] }, bridge);

		expect(restyled.sort()).toEqual([main, tokens].sort());
		expect(cssUpdate.mock.calls.flat().sort()).toEqual([main, tokens].sort());
		expect(persisted('styles/main.css')).toContain('--c: red');
		expect(service.version(old)).toBeUndefined();
	});

	it('shows the error of a stylesheet whose partial is deleted', async () => {
		const main = write('src/styles/main.css', "@import './base.css';\n");
		const base = write('src/styles/base.css', '.base {}\n');
		vi.spyOn(appLogger, 'error').mockReturnValue(appLogger);
		const service = await createService();
		await service.prewarm();
		const { bridge, error } = createBridge();

		fs.rmSync(base);
		expect(await service.applyChanges({ created: [], changed: [], deleted: [base] }, bridge)).toEqual([]);
		expect(error).toHaveBeenCalledWith(expect.stringContaining('base.css'));
		expect(service.version(main)).toBeDefined();
	});

	it('shows the error of a hook that throws and keeps running the batches queued after it', async () => {
		const main = write('src/styles/main.css', '.main { color: red; }\n');
		const page = write('src/pages/index.tsx', 'export default () => null;\n');
		vi.spyOn(appLogger, 'error').mockReturnValue(appLogger);
		const service = await createService(new InvalidatingProcessor(new Error('hook failed')));
		await service.prewarm();
		const { bridge, cssUpdate, error } = createBridge();

		write('src/styles/main.css', '.main { color: blue; }\n');
		const first = service.applyChanges(changed(page), bridge);
		const second = service.applyChanges(changed(main), bridge);
		write('src/styles/main.css', '.main { color: green; }\n');

		expect(await first).toEqual([]);
		expect(error).toHaveBeenCalledWith('hook failed');
		expect(await second).toEqual([main]);
		expect(persisted('styles/main.css')).toBe('.main { color: green; }\n');
		expect(cssUpdate).toHaveBeenCalledTimes(1);
	});

	it('rebuilds the stylesheet that imports a partial with a layer, and the partial on its own', async () => {
		const main = write('src/styles/main.css', "@import './base.css' layer(base);\n");
		const base = write('src/styles/base.css', '.base { color: red; }\n');
		const service = await createService();
		await service.prewarm();
		const { bridge, cssUpdate } = createBridge();

		write('src/styles/base.css', '.base { color: blue; }\n');
		const restyled = await service.applyChanges(changed(base), bridge);

		expect(restyled).toEqual([main, base]);
		expect(cssUpdate.mock.calls).toEqual([[main], [base]]);
		expect(persisted('styles/main.css')).toContain('@layer base {\n.base { color: blue; }\n}');
	});

	it('rebuilds the other of two stylesheets that import each other when one changes', async () => {
		const a = write('src/styles/a.css', "@import './b.css';\n.a { color: red; }\n");
		const b = write('src/styles/b.css', "@import './a.css';\n.b { color: blue; }\n");
		const cyclic = new (class extends InliningProcessor {
			override async transformStylesheet(css: string, file: string) {
				const other = file === a ? b : a;
				return {
					css: css.replace(
						/@import[^;]*;\n/u,
						fs.readFileSync(other, 'utf8').replace(/@import[^;]*;\n/u, ''),
					),
					dependencies: [other],
				};
			}
		})();
		const service = await createService(cyclic);
		await service.prewarm();
		const { bridge, cssUpdate } = createBridge();

		write('src/styles/a.css', "@import './b.css';\n.a { color: green; }\n");

		expect(await service.applyChanges(changed(a), bridge)).toEqual([b, a]);
		expect(cssUpdate.mock.calls).toEqual([[b], [a]]);
		expect(persisted('styles/b.css')).toContain('color: green');
	});

	it('refreshes the link of a stylesheet another one imports, and the link of its importer', async () => {
		const main = write('src/styles/main.css', "@import './base.css';\n.main {}\n");
		const base = write('src/styles/base.css', '.base { color: red; }\n');
		const service = await createService();
		await service.prewarm();
		const { bridge, cssUpdate } = createBridge();

		write('src/styles/base.css', '.base { color: blue; }\n');

		expect((await service.applyChanges(changed(base), bridge)).sort()).toEqual([base, main].sort());
		expect(cssUpdate.mock.calls.flat().sort()).toEqual([base, main].sort());
		expect(persisted('styles/base.css')).toBe('.base { color: blue; }\n');
	});

	it('shows no error for a partial that only compiles inside the stylesheet that imports it', async () => {
		const main = write('src/styles/main.css', "@import './open.css';\n  color: red;\n}\n");
		const open = write('src/styles/open.css', '.open {\n');
		const logError = vi.spyOn(appLogger, 'error').mockReturnValue(appLogger);
		const service = await createService();
		await service.prewarm();
		const { bridge, cssUpdate, error } = createBridge();

		write('src/styles/open.css', '.opened {\n');

		expect(await service.applyChanges(changed(open), bridge)).toEqual([main]);
		expect(cssUpdate.mock.calls).toEqual([[main]]);
		expect(error).not.toHaveBeenCalled();
		expect(logError).not.toHaveBeenCalled();
	});

	it('retries a partial that failed on its own when the stylesheet it was missing is created', async () => {
		write('src/styles/main.css', "@import './base.css';\n");
		const base = write('src/styles/base.css', "@import './missing.css';\n.base {}\n");
		vi.spyOn(appLogger, 'error').mockReturnValue(appLogger);
		const service = await createService();
		await service.prewarm();
		expect(persisted('styles/base.css')).toBeUndefined();

		const missing = write('src/styles/missing.css', '.missing {}\n');
		const restyled = await service.applyChanges(
			{ created: [missing], changed: [], deleted: [] },
			createBridge().bridge,
		);

		expect(restyled).toContain(base);
		expect(persisted('styles/base.css')).toContain('.missing');
	});

	it('sends nothing when a save leaves the output as it was', async () => {
		const main = write('src/styles/main.css', '.main { color: red; }\n');
		const service = await createService();
		await service.prewarm();
		const { bridge, cssUpdate } = createBridge();

		expect(await service.applyChanges(changed(main), bridge)).toEqual([]);
		expect(cssUpdate).not.toHaveBeenCalled();
	});

	it('keeps the last good output on a failure, then recovers on the save that fixes it', async () => {
		const main = write('src/styles/main.css', '.main { color: red; }\n');
		const service = await createService();
		await service.prewarm();
		const { bridge, cssUpdate, error } = createBridge();
		vi.spyOn(appLogger, 'error').mockReturnValue(appLogger);

		write('src/styles/main.css', '.main { color: red;\n');
		expect(await service.applyChanges(changed(main), bridge)).toEqual([]);
		expect(error).toHaveBeenCalledWith(expect.stringContaining('Unclosed block'));
		expect(cssUpdate).not.toHaveBeenCalled();
		expect(persisted('styles/main.css')).toBe('.main { color: red; }\n');

		write('src/styles/main.css', '.main { color: red; }\n');
		expect(await service.applyChanges(changed(main), bridge)).toEqual([main]);
		expect(cssUpdate.mock.calls).toEqual([[main]]);

		expect(await service.applyChanges(changed(main), bridge)).toEqual([]);
		expect(cssUpdate).toHaveBeenCalledTimes(1);
	});

	it('emits the files a url() names when it rebuilds after an edit', async () => {
		write('src/styles/fonts/mono.woff2', 'font-bytes');
		const main = write('src/styles/main.css', '.main { color: red; }\n');
		const service = await createService();
		await service.prewarm();

		write('src/styles/main.css', "@font-face { src: url('./fonts/mono.woff2'); }\n");
		await service.applyChanges(changed(main), createBridge().bridge);

		const reference = /url\("([^"]+)"\)/u.exec(persisted('styles/main.css') ?? '')?.[1];
		expect(reference).toMatch(/^\.\.\/[a-f0-9]{16}\.woff2$/u);
		expect(persisted(`styles/${reference}`)).toBe('font-bytes');
	});

	it('versions a stylesheet by its output, which changes with a partial', async () => {
		const main = write('src/styles/main.css', "@import './base.css';\n");
		const base = write('src/styles/base.css', '.base { color: red; }\n');
		const service = await createService();
		await service.prewarm();
		const before = service.version(main);

		write('src/styles/base.css', '.base { color: blue; }\n');
		await service.applyChanges(changed(base), createBridge().bridge);

		expect(before).toBeDefined();
		expect(service.version(main)).not.toBe(before);
	});

	it.each([
		{ invalidation: 'all' as const, rebuilt: ['main', 'other'] },
		{ invalidation: ['src/styles/other.css'], rebuilt: ['other'] },
		{ invalidation: [], rebuilt: [] },
	])(
		'rebuilds the stylesheets the invalidation hook names for a content change: $invalidation',
		async ({ invalidation, rebuilt }) => {
			const files = {
				main: write('src/styles/main.css', "@import './base.css';\n"),
				other: write('src/styles/other.css', '.other {}\n'),
			};
			write('src/styles/base.css', '.base { color: red; }\n');
			const page = write('src/pages/index.tsx', 'export default () => null;\n');
			const processor = new InvalidatingProcessor(
				Array.isArray(invalidation) ? invalidation.map((file) => path.join(rootDir, file)) : invalidation,
			);
			const service = await createService(processor);
			await service.prewarm();
			write('src/styles/main.css', "@import './base.css';\n.added {}\n");
			write('src/styles/other.css', '.other { color: red; }\n');

			const restyled = await service.applyChanges(changed(page), createBridge().bridge);

			expect(processor.received).toEqual([[page]]);
			expect(restyled.sort()).toEqual(rebuilt.map((name) => files[name as keyof typeof files]).sort());
		},
	);

	it('rebuilds nothing for a content change when the Processor has no invalidation hook', async () => {
		write('src/styles/main.css', '.main {}\n');
		const page = write('src/pages/index.tsx', 'export default () => null;\n');
		const service = await createService();
		await service.prewarm();
		write('src/styles/main.css', '.main { color: red; }\n');

		expect(await service.applyChanges(changed(page), createBridge().bridge)).toEqual([]);
	});
});

describe('DevelopmentStylesheetService with no Processor', () => {
	it('inlines an @import partial, rebuilds the stylesheet when the partial changes and sends css-update', async () => {
		const main = write('src/styles/main.css', "@import './base.css';\n.main {}\n");
		const base = write('src/styles/base.css', '.base { color: red; }\n');
		const service = await createService(null);
		await service.prewarm();
		const { bridge, cssUpdate } = createBridge();
		const before = service.version(main);
		expect(persisted('styles/main.css')).toContain('.base { color: red; }');

		write('src/styles/base.css', '.base { color: blue; }\n');
		const restyled = await service.applyChanges(changed(base), bridge);

		expect(restyled).toContain(main);
		expect(persisted('styles/main.css')).toContain('.base { color: blue; }');
		expect(persisted('styles/main.css')).not.toContain('@import');
		expect(service.version(main)).not.toBe(before);
		expect(cssUpdate).toHaveBeenCalledWith(main);
	});

	it('warns about a missing partial and recovers, with no restart, when the file appears', async () => {
		const warn = vi.spyOn(appLogger, 'warn').mockReturnValue(appLogger);
		const main = write('src/styles/main.css', "@import './later.css';\n.main {}\n");
		const service = await createService(null);
		await service.prewarm();
		expect(persisted('styles/main.css')).toContain("@import './later.css'");
		expect(warn).toHaveBeenCalledWith(expect.stringContaining('later.css'));

		const later = write('src/styles/later.css', '.later { color: red; }\n');
		const restyled = await service.applyChanges(
			{ created: [later], changed: [], deleted: [] },
			createBridge().bridge,
		);

		expect(restyled).toContain(main);
		expect(persisted('styles/main.css')).toContain('.later { color: red; }');
		expect(persisted('styles/main.css')).not.toContain('@import');
	});
});

describe('DevelopmentStylesheetService, for a CSS Module', () => {
	const MODULE = 'src/components/button.module.css';

	async function createModuleService() {
		const processor = new ScopingProcessor();
		const config = await finalizeEcoPagesConfig({ rootDir, integrations: [], processors: [processor] });
		processor.setContext(config);
		return new DevelopmentStylesheetService(config);
	}

	it('keeps the class map and the version of the module when only the CSS changes', async () => {
		const file = write(MODULE, '.primary { color: red; }\n');
		const service = await createModuleService();
		await service.prewarm();
		const version = service.version(file);
		const { bridge, cssUpdate } = createBridge();

		write(MODULE, '.primary { color: blue; }\n');
		expect(await service.applyChanges(changed(file), bridge)).toEqual([file]);

		expect(cssUpdate).toHaveBeenCalledWith(file);
		expect(service.keepsClassMap(file)).toBe(true);
		expect(service.version(file)).toBe(version);
	});

	it('changes the version of the module when a class is added, and says the class map changed', async () => {
		const file = write(MODULE, '.primary { color: red; }\n');
		const service = await createModuleService();
		await service.prewarm();
		const version = service.version(file);
		const { bridge, cssUpdate } = createBridge();

		write(MODULE, '.primary { color: red; }\n.secondary { color: blue; }\n');
		await service.applyChanges(changed(file), bridge);

		expect(cssUpdate).toHaveBeenCalledWith(file);
		expect(service.keepsClassMap(file)).toBe(false);
		expect(service.version(file)).not.toBe(version);
	});

	it('forgets the answer at the next batch and for a stylesheet that is not a CSS Module', async () => {
		const file = write(MODULE, '.primary { color: red; }\n');
		const plain = write('src/components/plain.css', '.plain { color: red; }\n');
		const service = await createModuleService();
		await service.prewarm();
		const { bridge } = createBridge();

		write(MODULE, '.primary { color: blue; }\n');
		write('src/components/plain.css', '.plain { color: blue; }\n');
		await service.applyChanges(changed(file, plain), bridge);
		expect(service.keepsClassMap(file)).toBe(true);
		expect(service.keepsClassMap(plain)).toBe(false);

		await service.applyChanges(changed(plain), bridge);
		expect(service.keepsClassMap(file)).toBe(false);
	});

	it('keeps the last good output while the module is broken and recovers when a save fixes it', async () => {
		const file = write(MODULE, '.primary { color: red; }\n');
		const service = await createModuleService();
		await service.prewarm();
		const version = service.version(file);
		const { bridge, error } = createBridge();

		write(MODULE, '.primary { color: red;\n');
		await service.applyChanges(changed(file), bridge);
		expect(error).toHaveBeenCalledTimes(1);
		expect(service.version(file)).toBe(version);

		write(MODULE, '.primary { color: green; }\n');
		expect(await service.applyChanges(changed(file), bridge)).toEqual([file]);
		expect(service.keepsClassMap(file)).toBe(true);
	});

	it('does not claim the browser holds a class map after the module was deleted and restored', async () => {
		const file = write(MODULE, '.primary { color: red; }\n');
		const service = await createModuleService();
		await service.prewarm();
		const { bridge } = createBridge();

		fs.rmSync(file);
		await service.applyChanges({ created: [], changed: [], deleted: [file] }, bridge);
		write(MODULE, '.primary { color: red; }\n');
		await service.applyChanges({ created: [file], changed: [], deleted: [] }, bridge);

		expect(service.keepsClassMap(file)).toBe(false);
	});

	describe('declarations', () => {
		const declaration = () =>
			path.join(rootDir, 'node_modules/@types/ecopages-css-modules/components/button.module.css.d.ts');
		const declared = () => (fs.existsSync(declaration()) ? fs.readFileSync(declaration(), 'utf8') : undefined);

		it('declares a CSS Module when it is prewarmed, and again when an edit adds a class', async () => {
			const file = write(MODULE, '.primary { color: red; }\n');
			const service = await createModuleService();
			await service.prewarm();
			expect(declared()).toContain('export declare const primary: string;');
			const { bridge } = createBridge();

			write(MODULE, '.primary { color: red; }\n.secondary { color: blue; }\n');
			await service.applyChanges(changed(file), bridge);

			expect(declared()).toContain('export declare const secondary: string;');
		});

		it('warns once, when it prewarms, that the tsconfig does not list the declarations', async () => {
			write(MODULE, '.primary { color: red; }\n');
			const warn = vi.spyOn(appLogger, 'warn').mockReturnValue(appLogger);
			const service = await createModuleService();

			await service.prewarm();
			await service.applyChanges(changed(path.join(rootDir, MODULE)), createBridge().bridge);

			expect(warn).toHaveBeenCalledTimes(1);
			expect(String(warn.mock.calls[0]![0])).toContain(
				'"rootDirs": ["./src", "./node_modules/@types/ecopages-css-modules"]',
			);
		});

		it('drops the declaration of a deleted CSS Module', async () => {
			const file = write(MODULE, '.primary { color: red; }\n');
			const service = await createModuleService();
			await service.prewarm();
			expect(declared()).toBeDefined();

			fs.rmSync(file);
			await service.applyChanges({ created: [], changed: [], deleted: [file] }, createBridge().bridge);

			expect(declared()).toBeUndefined();
		});
	});

	it('leaves an unused CSS Module alone when the Processor does not scope them', async () => {
		write('src/components/unused.module.css', '.unused { color: red; }\n');
		const service = await createService(new InliningProcessor());
		const error = vi.spyOn(appLogger, 'error').mockReturnValue(appLogger);

		await service.prewarm();

		expect(error).not.toHaveBeenCalled();
		expect(persisted('components/unused.module.css')).toBeUndefined();
	});
});
