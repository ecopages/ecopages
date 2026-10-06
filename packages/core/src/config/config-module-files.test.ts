import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { appLogger } from '../global/app-logger.ts';
import { collectConfigModuleFiles } from './config-module-files.ts';

describe('collectConfigModuleFiles', () => {
	let workDir: string;
	let rootDir: string;

	function write(relativePath: string, source: string): string {
		const filePath = path.join(workDir, relativePath);
		mkdirSync(path.dirname(filePath), { recursive: true });
		writeFileSync(filePath, source);
		return filePath;
	}

	beforeEach(() => {
		workDir = mkdtempSync(path.join(tmpdir(), 'eco-config-module-files-'));
		rootDir = path.join(workDir, 'app');
		write('app/node_modules/pkg/package.json', '{"name":"pkg","type":"module","main":"index.js"}');
		write('app/node_modules/pkg/index.js', 'export const pkg = ;\n');
		write('linked/package.json', '{"name":"linked","type":"module","main":"index.js"}');
		write('linked/index.js', 'export const linked = ;\n');
		symlinkSync(path.join(workDir, 'linked'), path.join(rootDir, 'node_modules/linked'), 'dir');
		write('app/tsconfig.json', '{"compilerOptions":{"paths":{"@/*":["./src/*"]}}}');
		write('shared/outside.ts', 'export const outside = 1;\n');
	});

	afterEach(() => {
		rmSync(workDir, { recursive: true, force: true });
		vi.restoreAllMocks();
	});

	it('lists the config and the project files it imports, in the spelling of rootDir', async () => {
		const options = write(
			'app/src/lib/options.ts',
			"import data from './data.json';\nexport const options = data;\n",
		);
		const data = write('app/src/lib/data.json', '{"a":1}');
		const util = write('app/src/lib/util.ts', 'export const util = 2;\n');
		const more = write('app/src/lib/more.ts', "import { util } from '@/lib/util';\nexport const more = util;\n");
		write('app/src/styles.css', 'body {}\n');
		const config = write(
			'app/eco.config.ts',
			[
				"import path from 'node:path';",
				"import { pkg } from 'pkg';",
				"import { linked } from 'linked';",
				"import { outside } from '../shared/outside';",
				"import './src/styles.css';",
				"import { generated } from './src/generated/missing';",
				"import { options } from './src/lib/options';",
				"import { more } from './src/lib/more.ts';",
				'export default { sep: path.sep, pkg, linked, outside, generated, options, more };',
			].join('\n'),
		);

		const moduleFiles = await collectConfigModuleFiles(config, rootDir);

		expect(moduleFiles.sort()).toEqual([config, data, more, options, util].sort());
	});

	it('scans a config that lives outside rootDir', async () => {
		const options = write('app/src/options.ts', 'export const options = { a: 1 };\n');
		const config = write(
			'config/eco.config.ts',
			"import { options } from '../app/src/options';\nexport default { options };\n",
		);

		expect((await collectConfigModuleFiles(config, rootDir)).sort()).toEqual([config, options].sort());
	});

	it('falls back to the config file and warns when a project file cannot be parsed', async () => {
		const warn = vi.spyOn(appLogger, 'warn').mockReturnValue(appLogger);
		write('app/src/lib/broken.ts', 'export const broken = ;\n');
		const config = write(
			'app/eco.config.ts',
			"import { broken } from './src/lib/broken';\nexport default { broken };\n",
		);

		expect(await collectConfigModuleFiles(config, rootDir)).toEqual([config]);
		expect(warn).toHaveBeenCalledWith(expect.stringContaining(config));
	});
});
