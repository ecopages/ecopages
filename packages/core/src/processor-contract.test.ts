import fs from 'node:fs';
import os from 'node:os';
import { path } from '@ecopages/file-system/path';
import { describe, expect, it } from 'vitest';
import { InliningProcessor } from './__fixtures__/stylesheets/inlining-processor.ts';
import { ScopingProcessor } from './__fixtures__/stylesheets/scoping-processor.ts';
import { assertBuildSucceeded } from './build/build-log.ts';
import { createServerBuildRequest } from './build/runtime/build-request-policy.ts';
import { finalizeEcoPagesConfig } from './config/assembly/finalize-config.ts';
import { stylesheetProcessorContract } from './processor-contract.ts';
import { requireAppRuntime } from './utils/app-runtime.ts';

describe('stylesheet Processor contract, for a fixture Processor', () => {
	const cases = stylesheetProcessorContract({
		createProcessor: () => new InliningProcessor(),
	});
	for (const contractCase of cases) {
		it(contractCase.name, contractCase.run);
	}
});

describe('stylesheet Processor contract, for a fixture scoping Processor', () => {
	const cases = stylesheetProcessorContract({
		createProcessor: () => new ScopingProcessor(),
		cssModules: true,
	});
	for (const contractCase of cases) {
		it(contractCase.name, contractCase.run);
	}
});

describe('an app with no stylesheet Processor', () => {
	it('gives a stylesheet imported as text its source unchanged', async () => {
		const rootDir = path.fromNative(fs.mkdtempSync(path.join(os.tmpdir(), 'eco-plain-css-')));
		try {
			const css = ".card { color: red; }\n@import './other.css';\n";
			fs.mkdirSync(path.join(rootDir, 'src'), { recursive: true });
			fs.writeFileSync(path.join(rootDir, 'src', 'card.css'), css);
			const entry = path.join(rootDir, 'src', 'card.script.ts');
			fs.writeFileSync(entry, "import styles from './card.css';\nexport { styles };\n");
			const config = await finalizeEcoPagesConfig({ rootDir, integrations: [], processors: [] });

			const result = await requireAppRuntime(config).buildAdapter.build(
				createServerBuildRequest(config, {
					entrypoints: [entry],
					outdir: path.join(rootDir, 'out'),
					root: rootDir,
					writeToDisk: false,
				}),
			);

			assertBuildSucceeded(result, 'Server build failed');
			expect(result.outputs.map((file) => file.content ?? '').join('\n')).toContain(JSON.stringify(css));
		} finally {
			fs.rmSync(rootDir, { recursive: true, force: true });
		}
	});
});
