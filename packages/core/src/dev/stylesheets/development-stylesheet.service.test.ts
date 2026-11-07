import fs from 'node:fs';
import os from 'node:os';
import { path } from '@ecopages/file-system/path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { finalizeEcoPagesConfig } from '../../config/assembly/finalize-config.ts';
import type { EcoPagesAppConfig, IClientBridge } from '../../config/internal-types.ts';
import { appLogger } from '../../global/app-logger.ts';
import type { StylesheetInvalidation } from '../../plugins/processor.ts';
import { InliningProcessor } from '../../__fixtures__/stylesheets/inlining-processor.ts';
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

async function createService(processor = new InliningProcessor()): Promise<DevelopmentStylesheetService> {
	const config: EcoPagesAppConfig = await finalizeEcoPagesConfig({
		rootDir,
		integrations: [],
		processors: [processor],
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

	it('rebuilds the stylesheet that imports a partial with a layer, and refreshes only its link', async () => {
		const main = write('src/styles/main.css', "@import './base.css' layer(base);\n");
		const base = write('src/styles/base.css', '.base { color: red; }\n');
		const service = await createService();
		await service.prewarm();
		const { bridge, cssUpdate } = createBridge();

		write('src/styles/base.css', '.base { color: blue; }\n');
		const restyled = await service.applyChanges(changed(base), bridge);

		expect(restyled).toEqual([main]);
		expect(cssUpdate.mock.calls).toEqual([[main]]);
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

		expect(await service.applyChanges(changed(a), bridge)).toEqual([b]);
		expect(cssUpdate.mock.calls).toEqual([[b]]);
		expect(persisted('styles/b.css')).toContain('color: green');
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
