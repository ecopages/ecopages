import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { path } from '@ecopages/file-system/path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { scanForeignJsxReach } from './foreign-jsx-reach.ts';

describe('scanForeignJsxReach', () => {
	let root: string;

	beforeEach(() => {
		root = realpathSync(mkdtempSync(path.join(tmpdir(), 'foreign-jsx-reach-')));
		mkdirSync(path.join(root, 'src'));
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	const write = (name: string, source: string): string => {
		const filePath = path.join(root, 'src', name);
		writeFileSync(filePath, source);
		return filePath;
	};
	const isForeignFile = (filePath: string) => filePath.endsWith('.tsx') && !filePath.endsWith('.react.tsx');

	it('keeps a foreign file that is itself a non-React entry with its owner', () => {
		const script = write('widget.script.tsx', `export const widget = 1;`);
		const island = write('demo.react.tsx', `export const demo = 1;`);

		const reach = scanForeignJsxReach({
			projectRoot: root,
			reactEntryFiles: new Set([island]),
			otherEntryFiles: [script],
			isForeignFile,
		});

		expect(reach.others.get(script)).toBe(script);
		expect(reach.react.has(script)).toBe(false);
	});

	it('still reports a foreign file a React entry imports', () => {
		const shared = write('shared.tsx', `export const shared = 1;`);
		const island = write('demo.react.tsx', `import { shared } from './shared.tsx';\nexport const demo = shared;`);

		const reach = scanForeignJsxReach({
			projectRoot: root,
			reactEntryFiles: new Set([island]),
			otherEntryFiles: [],
			isForeignFile,
		});

		expect(reach.react.has(shared)).toBe(true);
	});
});
