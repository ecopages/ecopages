import fs from 'node:fs';
import os from 'node:os';
import { path } from '@ecopages/file-system/path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { finalizeEcoPagesConfig } from '../../config/assembly/finalize-config.ts';
import type { EcoPagesAppConfig, IClientBridge } from '../../config/internal-types.ts';
import { appLogger } from '../../global/app-logger.ts';
import { Processor, type ProcessorWatchConfig } from '../../plugins/processor.ts';
import { DevelopmentStylesheetService } from './development-stylesheet.service.ts';

const IMPORT = /@import\s+['"](\.[^'"]+)['"]\s*(?:layer\((\w+)\))?\s*;/gu;

/** Inlines relative `@import`s, reporting each as a dependency, and rejects an unclosed block. */
class InliningProcessor extends Processor {
	async setup(): Promise<void> {}

	override async transformStylesheet(css: string, file: string) {
		if (css.split('{').length !== css.split('}').length) throw new Error(`${file}: Unclosed block`);
		const dependencies: string[] = [];
		const inlined = css.replace(IMPORT, (_statement, specifier: string, layer: string | undefined) => {
			const imported = path.resolve(path.dirname(file), specifier);
			dependencies.push(imported);
			const contents = fs.readFileSync(imported, 'utf8');
			return layer ? `@layer ${layer} {\n${contents}}\n` : contents;
		});
		return { css: inlined, dependencies };
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

async function createService(watch?: ProcessorWatchConfig): Promise<DevelopmentStylesheetService> {
	const config: EcoPagesAppConfig = await finalizeEcoPagesConfig({
		rootDir,
		integrations: [],
		processors: [
			new InliningProcessor({
				name: 'inlining',
				capabilities: [{ kind: 'stylesheet', extensions: ['*.css'] }],
				watch,
			}),
		],
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
		const service = await createService();

		await service.prewarm();

		expect(persisted('styles/main.css')).toBe('.main { color: red; }\n');
		expect(persisted('public/vendor.css')).toBeUndefined();
	});

	it('persists nothing in production', async () => {
		vi.stubEnv('NODE_ENV', 'production');
		write('src/styles/main.css', '.main { color: red; }\n');
		const service = await createService();

		await service.prewarm();

		expect(persisted('styles/main.css')).toBeUndefined();
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

	it('rebuilds every entry stylesheet when content the Processor watches changes', async () => {
		const main = write('src/styles/main.css', "@import './base.css';\n");
		write('src/styles/base.css', '.base { color: red; }\n');
		const page = write('src/pages/index.tsx', 'export default () => null;\n');
		const service = await createService({ paths: [], extensions: ['.tsx'] });
		await service.prewarm();
		write('src/styles/main.css', "@import './base.css';\n.added {}\n");
		const { bridge, cssUpdate } = createBridge();

		expect(await service.applyChanges(changed(page), bridge)).toEqual([main]);
		expect(cssUpdate.mock.calls).toEqual([[main]]);
	});
});
