import fs from 'node:fs';
import os from 'node:os';
import { path } from '@ecopages/file-system/path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { finalizeEcoPagesConfig } from '../../../../config/assembly/finalize-config.ts';
import type { EcoPagesAppConfig } from '../../../../config/internal-types.ts';
import { Processor } from '../../../../plugins/processor.ts';
import { requireAppRuntime } from '../../../../utils/app-runtime.ts';
import { createBrowserBuildRequest, createServerBuildRequest } from '../../../../build/runtime/build-request-policy.ts';
import type { BuildOptions } from '../../../../build/contracts/build-contracts.ts';
import { assertBuildSucceeded } from '../../../../build/build-log.ts';
import { DevTransformServer } from '../../../../dev/transform-server/dev-transform-server.ts';

/** Compiles the one utility the fixture stylesheet uses, the way Tailwind compiles `@apply`. */
class ApplyProcessor extends Processor {
	async setup(): Promise<void> {}

	override async transformStylesheet(css: string): Promise<string> {
		return css.replace('@apply text-red;', 'color: red;');
	}
}

const SOURCE_CSS = '.card {\n\t@apply text-red;\n}\n';
const PROCESSED_CSS = '.card {\n\tcolor: red;\n}\n';

let rootDir: string;
let cssFile: string;
let entryFile: string;
let config: EcoPagesAppConfig;

beforeEach(async () => {
	rootDir = path.fromNative(fs.mkdtempSync(path.join(os.tmpdir(), 'stylesheet-import-contract-')));
	cssFile = path.join(rootDir, 'src', 'components', 'card.css');
	entryFile = path.join(rootDir, 'src', 'components', 'card.script.ts');
	fs.mkdirSync(path.dirname(cssFile), { recursive: true });
	fs.writeFileSync(cssFile, SOURCE_CSS);
	fs.writeFileSync(entryFile, "import styles from './card.css';\nexport default styles;\n");
	config = await finalizeEcoPagesConfig({
		rootDir,
		integrations: [],
		processors: [
			new ApplyProcessor({ name: 'apply', capabilities: [{ kind: 'stylesheet', extensions: ['*.css'] }] }),
		],
	});
});

afterEach(() => {
	fs.rmSync(rootDir, { recursive: true, force: true });
});

async function buildEntry(request: BuildOptions): Promise<string> {
	const result = await requireAppRuntime(config).buildAdapter.build(request);
	assertBuildSucceeded(result, 'Build failed');
	return result.outputs.map((output) => output.content ?? '').join('\n');
}

describe('a stylesheet imported as text', () => {
	it.fails('compiles to the processed CSS in a server build', async () => {
		const output = await buildEntry(
			createServerBuildRequest(config, {
				entrypoints: [entryFile],
				outdir: path.join(rootDir, 'out'),
				root: rootDir,
				writeToDisk: false,
			}),
		);

		expect(output).toContain(JSON.stringify(PROCESSED_CSS));
	});

	it.fails('compiles to the processed CSS in a browser bundle', async () => {
		const output = await buildEntry(
			createBrowserBuildRequest(config, {
				entrypoints: [entryFile],
				outdir: path.join(rootDir, 'out'),
				root: rootDir,
				writeToDisk: false,
			}),
		);

		expect(output).toContain(JSON.stringify(PROCESSED_CSS));
	});

	it.fails('compiles to the processed CSS in the dev transform server', async () => {
		const server = new DevTransformServer({ appConfig: config });
		const response = await server.tryHandleRequest(
			new Request(`http://localhost${server.registerModule(cssFile)}`),
		);

		expect(await response?.text()).toBe(`export default ${JSON.stringify(PROCESSED_CSS)};\n`);
	});
});
