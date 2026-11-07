import fs from 'node:fs';
import os from 'node:os';
import { path } from '@ecopages/file-system/path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { finalizeEcoPagesConfig } from '../../../../config/assembly/finalize-config.ts';
import type { EcoPagesAppConfig } from '../../../../config/internal-types.ts';
import { Processor } from '../../../../plugins/processor.ts';
import { requireAppRuntime } from '../../../../utils/app-runtime.ts';
import { createBrowserBuildRequest, createServerBuildRequest } from '../../../../build/runtime/build-request-policy.ts';
import type { BuildOptions } from '../../../../build/contracts/build-contracts.ts';
import { assertBuildSucceeded } from '../../../../build/build-log.ts';
import { DevTransformServer } from '../../../../dev/transform-server/dev-transform-server.ts';
import { appLogger } from '../../../../global/app-logger.ts';

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
	vi.restoreAllMocks();
	fs.rmSync(rootDir, { recursive: true, force: true });
});

async function buildEntry(request: BuildOptions): Promise<string> {
	const result = await requireAppRuntime(config).buildAdapter.build(request);
	assertBuildSucceeded(result, 'Build failed');
	return result.outputs.map((output) => output.content ?? '').join('\n');
}

describe('a stylesheet imported as text', () => {
	it('compiles to the processed CSS in a server build', async () => {
		const output = await buildEntry(
			createServerBuildRequest(config, {
				entrypoints: [entryFile],
				outdir: path.join(rootDir, 'out'),
				root: rootDir,
				writeToDisk: false,
			}),
		);

		expect(output).toContain('color: red;');
		expect(output).not.toContain('@apply');
	});

	it('compiles to the processed CSS in a browser bundle', async () => {
		const output = await buildEntry(
			createBrowserBuildRequest(config, {
				entrypoints: [entryFile],
				outdir: path.join(rootDir, 'out'),
				root: rootDir,
				writeToDisk: false,
			}),
		);

		expect(output).toContain('color: red;');
		expect(output).not.toContain('@apply');
	});

	it('compiles to the processed CSS in the dev transform server', async () => {
		const server = new DevTransformServer({ appConfig: config });
		const response = await server.tryHandleRequest(
			new Request(`http://localhost${server.registerModule(cssFile)}`),
		);

		expect(await response?.text()).toBe(`export default ${JSON.stringify(PROCESSED_CSS)};\n`);
	});
});

describe("a package's own side-effect stylesheet import outside production", () => {
	it.fails('warns once per file and builds, since its CSS never reaches a Page', async () => {
		const packageDir = path.join(rootDir, 'node_modules', 'css-widget');
		fs.mkdirSync(packageDir, { recursive: true });
		fs.writeFileSync(
			path.join(packageDir, 'package.json'),
			JSON.stringify({ name: 'css-widget', version: '1.0.0', type: 'module', main: './index.js' }),
		);
		fs.writeFileSync(path.join(packageDir, 'index.js'), "import './style.css';\nexport const widget = 'widget';\n");
		fs.writeFileSync(path.join(packageDir, 'style.css'), '.css-widget-marker { color: red; }\n');
		const widgetEntry = path.join(rootDir, 'src', 'widget.script.ts');
		fs.writeFileSync(widgetEntry, "import { widget } from 'css-widget';\nconsole.log(widget);\n");
		const warn = vi.spyOn(appLogger, 'warn').mockReturnValue(appLogger);
		const build = () =>
			buildEntry(
				createBrowserBuildRequest(config, {
					entrypoints: [widgetEntry],
					outdir: path.join(rootDir, 'out'),
					root: rootDir,
					writeToDisk: false,
				}),
			);

		expect(await build()).not.toContain('css-widget-marker');
		expect(await build()).not.toContain('css-widget-marker');

		const warnings = warn.mock.calls.map((call) => String(call[0]));
		expect(warnings.filter((message) => message.includes('never reaches a Page'))).toHaveLength(1);
		expect(warnings.join('\n')).toContain('css-widget/index.js');
	});
});
