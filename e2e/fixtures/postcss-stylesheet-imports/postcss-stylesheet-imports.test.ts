import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { finalizeEcoPagesConfig } from '../../../packages/core/src/config/assembly/finalize-config.ts';
import type { EcoPagesAppConfig } from '../../../packages/core/src/config/internal-types.ts';
import { createBrowserBuildRequest } from '../../../packages/core/src/build/runtime/build-request-policy.ts';
import { requireAppRuntime } from '../../../packages/core/src/utils/app-runtime.ts';
import { startHmrManager } from '../../../packages/core/src/adapters/shared/hmr/hmr-manager.test-helpers.ts';
import type { ClientBridgeEvent } from '../../../packages/core/src/types/contracts.ts';
import { assertBuildFailed } from '../../../packages/core/src/__fixtures__/build/build-result.ts';
import { PostCssProcessorPlugin } from '../../../packages/processors/postcss-processor/src/plugin.ts';

const GOOD_CSS = '.card { color: red; }\n';
const BROKEN_CSS = '.card { color: red; } }\n';
const COMPILED_MODULE = `export default ${JSON.stringify(`${GOOD_CSS}/* postcss */`)};\n`;

/** A plugin that does nothing, so PostCSS parses the stylesheet: with no plugins it returns the input unparsed. */
const parseOnly = { postcssPlugin: 'parse-only', Once() {} };

const roots: string[] = [];

afterEach(() => {
	vi.unstubAllEnvs();
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** An app whose one stylesheet Processor is PostCSS, with `src/card.css` imported as text by `src/card.script.ts`. */
async function createPostcssApp(css: string): Promise<{ config: EcoPagesAppConfig; cssFile: string; script: string }> {
	const rootDir = mkdtempSync(path.join(tmpdir(), 'postcss-stylesheet-imports-'));
	roots.push(rootDir);
	mkdirSync(path.join(rootDir, 'src'), { recursive: true });
	const cssFile = path.join(rootDir, 'src', 'card.css');
	const script = path.join(rootDir, 'src', 'card.script.ts');
	writeFileSync(cssFile, css);
	writeFileSync(script, "import styles from './card.css';\nexport default styles;\n");
	const processor = new PostCssProcessorPlugin({
		options: { plugins: { parseOnly }, transformOutput: (output) => `${output}/* postcss */` },
	});
	const config = await finalizeEcoPagesConfig({ rootDir, integrations: [], processors: [processor] });
	processor.setContext(config);
	return { config, cssFile, script };
}

describe('a stylesheet imported as text, through the PostCSS Processor', () => {
	it('fails the production build when PostCSS rejects it', async () => {
		vi.stubEnv('NODE_ENV', 'production');
		const { config, script } = await createPostcssApp(BROKEN_CSS);

		const result = await requireAppRuntime(config).buildAdapter.build(
			createBrowserBuildRequest(config, {
				entrypoints: [script],
				outdir: path.join(config.rootDir, 'out'),
				root: config.rootDir,
				writeToDisk: false,
			}),
		);

		assertBuildFailed(result);
		expect(result.logs.map((log) => log.message).join('\n')).toContain('Unexpected }');
	});

	it('shows the error in dev, keeps the last good module and recovers when the save restores the same CSS', async () => {
		const { config, cssFile, script } = await createPostcssApp(GOOD_CSS);
		const { manager, broadcasts } = startHmrManager(config, 1);
		const { outputUrl } = await manager.registerScriptEntrypoint(script);
		const scriptModule = await (
			await manager.tryHandleDevClientRequest(new Request(`http://localhost${outputUrl}`))
		)?.text();
		const stylesheetUrl = /from ['"]([^'"]+card\.css)\?v=/u.exec(scriptModule ?? '')?.[1];
		const requestStylesheet = async () => {
			const response = await manager.tryHandleDevClientRequest(new Request(`http://localhost${stylesheetUrl}`));
			return { status: response?.status, code: await response?.text() };
		};
		const pendingErrors = () => {
			const received: ClientBridgeEvent[] = [];
			manager.sendPendingBuildErrors({ send: (payload) => received.push(JSON.parse(payload)) });
			return received;
		};
		const save = async (css: string) => {
			broadcasts.length = 0;
			writeFileSync(cssFile, css);
			await manager.handleFileChanges([cssFile]);
		};
		expect(await requestStylesheet()).toEqual({ status: 200, code: COMPILED_MODULE });

		await save(BROKEN_CSS);
		expect(await requestStylesheet()).toEqual({ status: 200, code: COMPILED_MODULE });
		expect(broadcasts).toContainEqual({ type: 'error', message: expect.stringContaining('Unexpected }') });
		expect(pendingErrors()).toHaveLength(1);

		await save(GOOD_CSS);
		expect(broadcasts).toEqual([{ type: 'update', path: outputUrl, timestamp: expect.any(Number) }]);
		expect(await requestStylesheet()).toEqual({ status: 200, code: COMPILED_MODULE });
		expect(broadcasts.some((event) => event.type === 'error')).toBe(false);
		expect(pendingErrors()).toEqual([]);
	});
});
