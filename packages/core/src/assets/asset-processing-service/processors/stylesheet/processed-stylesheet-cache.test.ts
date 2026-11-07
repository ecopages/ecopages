import { fileSystem } from '@ecopages/file-system';
import { path } from '@ecopages/file-system/path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InliningProcessor } from '../../../../__fixtures__/stylesheets/inlining-processor.ts';
import { assertBuildSucceeded } from '../../../../build/build-log.ts';
import { createServerBuildRequest } from '../../../../build/runtime/build-request-policy.ts';
import { finalizeEcoPagesConfig } from '../../../../config/assembly/finalize-config.ts';
import type { EcoPagesAppConfig, IClientBridge } from '../../../../config/internal-types.ts';
import { DevelopmentStylesheetService } from '../../../../dev/stylesheets/development-stylesheet.service.ts';
import type { StylesheetInvalidation } from '../../../../plugins/processor.ts';
import { requireAppRuntime } from '../../../../utils/app-runtime.ts';
import { compileStylesheetModule } from './stylesheet-module.ts';
import { ProcessedStylesheetCache } from './processed-stylesheet-cache.ts';

/** An {@link InliningProcessor} that counts its transforms and invalidates every stylesheet for a content change. */
class CountingProcessor extends InliningProcessor {
	readonly transformed: string[] = [];
	suffix = '';

	override async transformStylesheet(css: string, file: string) {
		this.transformed.push(file);
		const result = await super.transformStylesheet(css, file);
		return { ...result, css: `${result.css}${this.suffix}` };
	}

	override invalidateStylesheets(): StylesheetInvalidation {
		return 'all';
	}
}

let rootDir: string;
let processor: CountingProcessor;
let config: EcoPagesAppConfig;
const bridge = { cssUpdate: () => {}, error: () => {} } as unknown as IClientBridge;

function write(relativePath: string, contents: string): string {
	const file = path.join(rootDir, relativePath);
	fileSystem.write(file, contents);
	return file;
}

async function buildServer(entry: string): Promise<string> {
	const result = await requireAppRuntime(config).buildAdapter.build(
		createServerBuildRequest(config, {
			entrypoints: [entry],
			outdir: path.join(rootDir, 'out'),
			root: rootDir,
			writeToDisk: false,
		}),
	);
	assertBuildSucceeded(result, 'Server build failed');
	return result.outputs.map((output) => output.content ?? '').join('\n');
}

beforeEach(async () => {
	rootDir = fileSystem.realpath(fileSystem.mkdtemp(path.join(fileSystem.tempDir(), 'processed-stylesheets-')));
	vi.stubEnv('NODE_ENV', 'development');
	processor = new CountingProcessor();
	config = await finalizeEcoPagesConfig({ rootDir, integrations: [], processors: [processor] });
});

afterEach(() => {
	fileSystem.remove(rootDir);
});

describe('the processed stylesheet a dev edit produces', () => {
	it('runs the Processor once for the dev service, the dev transform compile and the server build', async () => {
		const card = write('src/card.css', "@import './tokens.css';\n.card {}\n");
		const tokens = write('src/tokens.css', ':root { --c: red; }\n');
		const entry = write('src/card.script.ts', "import styles from './card.css';\nexport default styles;\n");
		const service = new DevelopmentStylesheetService(config);
		await service.prewarm();

		write('src/tokens.css', ':root { --c: blue; }\n');
		processor.transformed.length = 0;
		await service.applyChanges({ created: [], changed: [tokens], deleted: [] }, bridge);
		const module = await compileStylesheetModule(config, card);
		const server = await buildServer(entry);

		expect(processor.transformed.filter((file) => file === card)).toEqual([card]);
		expect(module.code).toContain('--c: blue');
		expect(server).toContain('--c: blue');
	});

	it('runs the Processor again when content the invalidation hook covers changes', async () => {
		const card = write('src/card.css', '.card {}\n');
		const page = write('src/page.tsx', 'export default null;\n');
		const service = new DevelopmentStylesheetService(config);
		await service.prewarm();
		expect((await compileStylesheetModule(config, card)).code).not.toContain('scanned');

		processor.suffix = '.scanned {}\n';
		await service.applyChanges({ created: [], changed: [page], deleted: [] }, bridge);

		expect((await compileStylesheetModule(config, card)).code).toContain('scanned');
	});

	it('runs the Processor again for a stylesheet that imports the one a content change affects', async () => {
		const reference = write('src/styles/reference.css', '.reference {}\n');
		const component = write('src/components/card.css', "@import '../styles/reference.css';\n.card {}\n");
		const page = write('src/page.tsx', 'export default null;\n');
		processor.invalidateStylesheets = () => [reference];
		const service = new DevelopmentStylesheetService(config);
		await service.prewarm();
		expect((await compileStylesheetModule(config, component)).code).not.toContain('scanned');

		processor.suffix = '.scanned {}\n';
		await service.applyChanges({ created: [], changed: [page], deleted: [] }, bridge);

		expect((await compileStylesheetModule(config, component)).code).toContain('scanned');
	});

	it('runs the Processor again after a batch changes an input it read that is not a stylesheet', async () => {
		const card = write('src/card.css', '.card {}\n');
		const tokens = write('src/tokens.json', '{"c":"red"}');
		const reading = new (class extends InliningProcessor {
			override async transformStylesheet(css: string, file: string) {
				const result = await super.transformStylesheet(css, file);
				return {
					...result,
					css: `${result.css}/* ${fileSystem.readFileSync(tokens)} */`,
					dependencies: [tokens],
				};
			}
		})();
		config = await finalizeEcoPagesConfig({ rootDir, integrations: [], processors: [reading] });
		const service = new DevelopmentStylesheetService(config);
		await service.prewarm();
		expect((await compileStylesheetModule(config, card)).code).toContain('red');

		write('src/tokens.json', '{"c":"blue"}');
		await service.applyChanges({ created: [], changed: [tokens], deleted: [] }, bridge);

		expect((await compileStylesheetModule(config, card)).code).toContain('blue');
	});
});

describe('ProcessedStylesheetCache', () => {
	it('keeps no result of a transform that started before an eviction, and transforms again', async () => {
		const cache = new ProcessedStylesheetCache();
		const outputs = ['stale', 'fresh'];
		let release!: () => void;
		const gate = new Promise<void>((resolve) => (release = resolve));
		const transform = vi.fn(async () => {
			const css = outputs.shift()!;
			if (css === 'stale') await gate;
			return { css, dependencies: [] };
		});

		const pending = cache.get('/app/a.css', '.a {}', transform);
		cache.evict();
		release();

		expect((await pending).css).toBe('fresh');
		expect((await cache.get('/app/a.css', '.a {}', transform)).css).toBe('fresh');
		expect(transform).toHaveBeenCalledTimes(2);
	});
});
