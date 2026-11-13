import fs from 'node:fs/promises';
import os from 'node:os';
import { path } from '@ecopages/file-system/path';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { appLogger } from '../../global/app-logger.ts';
import type { EcoPagesAppConfig } from '../../config/internal-types.ts';
import { warnUnattachedScripts } from './unattached-scripts.ts';

let srcDir: string;
let appConfig: EcoPagesAppConfig;

beforeEach(async () => {
	srcDir = await fs.mkdtemp(path.join(os.tmpdir(), 'eco-unattached-scripts-'));
	appConfig = { absolutePaths: { srcDir } } as EcoPagesAppConfig;
});

afterEach(async () => {
	vi.restoreAllMocks();
	await fs.rm(srcDir, { recursive: true, force: true });
});

const write = async (file: string, text = '') => {
	const filePath = path.join(srcDir, file);
	await fs.mkdir(path.dirname(filePath), { recursive: true });
	await fs.writeFile(filePath, text);
};

test('warns once for a .script.* file no source names', async () => {
	const warn = vi.spyOn(appLogger, 'warn').mockImplementation(() => appLogger);
	await write('components/orphan.script.ts');
	await write('components/card.tsx', `eco.component({ dependencies: { scripts: ['./other.script.ts'] } })`);

	await warnUnattachedScripts(appConfig);
	await warnUnattachedScripts(appConfig);

	expect(warn).toHaveBeenCalledTimes(1);
	expect(warn.mock.calls[0]?.[0]).toContain(path.join(srcDir, 'components/orphan.script.ts'));
	expect(warn.mock.calls[0]?.[0]).toContain('no page or component attaches');
});

test.each([
	['dependencies.scripts entry', "eco.component({ dependencies: { scripts: ['./counter.script.ts'] } })"],
	['extensionless entry', `eco.component({ dependencies: { scripts: ["./counter.script"] } })`],
	['script tag', '<script type="module" src="./counter.script.ts"></script>'],
])('does not warn for a script a source names through a %s', async (_label, text) => {
	const warn = vi.spyOn(appLogger, 'warn').mockImplementation(() => appLogger);
	await write('components/counter.script.ts');
	await write('components/card.tsx', text);

	await warnUnattachedScripts(appConfig);

	expect(warn).not.toHaveBeenCalled();
});

test('does not count a script naming itself', async () => {
	const warn = vi.spyOn(appLogger, 'warn').mockImplementation(() => appLogger);
	await write('components/self.script.ts', `// ./self.script.ts`);
	await write('components/self.script.ts', `export const own = './self.script.ts';`);

	await warnUnattachedScripts(appConfig);

	expect(warn).toHaveBeenCalledTimes(1);
});
