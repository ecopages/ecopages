import fs from 'node:fs';
import { describe, expect, test } from 'vitest';
import { finalizeEcoPagesConfig } from '../../../config/assembly/finalize-config.ts';
import { Processor } from '../../../plugins/processor.ts';
import type { ClientBridgeEvent } from '../../../types/contracts.ts';
import type { HmrManager } from './hmr-manager.ts';
import { createTempRoot, startHmrManager, writeSourceFile } from './hmr-manager.test-helpers.ts';

/** Compiles `@apply text-red;` and throws on an unclosed block, as a CSS Processor does. */
class StrictProcessor extends Processor {
	async setup(): Promise<void> {}

	override async transformStylesheet(css: string): Promise<{ css: string }> {
		if (css.includes('{{')) throw new Error('Unclosed block');
		return { css: css.replace('@apply text-red;', 'color: red;') };
	}
}

const GOOD_CSS = '.card { @apply text-red; }\n';
const COMPILED_MODULE = 'export default ".card { color: red; }\\n";\n';

function collectPendingBuildErrors(manager: HmrManager): ClientBridgeEvent[] {
	const received: ClientBridgeEvent[] = [];
	manager.sendPendingBuildErrors({ send: (payload) => received.push(JSON.parse(payload)) });
	return received;
}

describe('a stylesheet a script imports as text', () => {
	test('hot-updates its importer on every save, shows a failed compile and recovers when the save restores the last good CSS', async () => {
		const rootDir = createTempRoot('ecopages-hmr-stylesheet-import');
		const cssFile = writeSourceFile(rootDir, 'src/components/card.css', GOOD_CSS);
		const script = writeSourceFile(
			rootDir,
			'src/components/card.script.ts',
			"import styles from './card.css';\nexport default styles;\n",
		);
		const config = await finalizeEcoPagesConfig({
			rootDir,
			integrations: [],
			processors: [
				new StrictProcessor({ name: 'strict', capabilities: [{ kind: 'stylesheet', extensions: ['*.css'] }] }),
			],
		});
		const { manager, broadcasts } = startHmrManager(config, 1);
		const { outputUrl } = await manager.registerScriptEntrypoint(script);
		const scriptModule = await (
			await manager.tryHandleDevClientRequest(new Request(`http://localhost${outputUrl}`))
		)?.text();
		const stylesheetUrl = /from ['"]([^'"]+card\.css)\?v=/u.exec(scriptModule ?? '')?.[1];
		expect(stylesheetUrl).toBeDefined();
		const requestStylesheet = async () => {
			const response = await manager.tryHandleDevClientRequest(new Request(`http://localhost${stylesheetUrl}`));
			return { status: response?.status, code: await response?.text() };
		};
		expect(await requestStylesheet()).toEqual({ status: 200, code: COMPILED_MODULE });
		const save = async (css: string) => {
			broadcasts.length = 0;
			fs.writeFileSync(cssFile, css);
			await manager.handleFileChanges([cssFile]);
		};

		await save('.card {{\n');
		expect(broadcasts).toEqual([{ type: 'update', path: outputUrl, timestamp: expect.any(Number) }]);
		expect(await requestStylesheet()).toEqual({ status: 200, code: COMPILED_MODULE });
		expect(broadcasts.at(-1)).toMatchObject({ type: 'error', message: expect.stringContaining('Unclosed block') });
		expect(collectPendingBuildErrors(manager)).toHaveLength(1);

		await save(GOOD_CSS);
		expect(broadcasts).toEqual([{ type: 'update', path: outputUrl, timestamp: expect.any(Number) }]);
		expect(await requestStylesheet()).toEqual({ status: 200, code: COMPILED_MODULE });
		expect(broadcasts.some((event) => event.type === 'error')).toBe(false);
		expect(collectPendingBuildErrors(manager)).toEqual([]);

		await save('.card { @apply text-red; margin: 0; }\n');
		expect(broadcasts).toEqual([{ type: 'update', path: outputUrl, timestamp: expect.any(Number) }]);
		expect(await requestStylesheet()).toEqual({
			status: 200,
			code: 'export default ".card { color: red; margin: 0; }\\n";\n',
		});
	});
});
