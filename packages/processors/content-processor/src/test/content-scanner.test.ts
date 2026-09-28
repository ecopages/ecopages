import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fileSystem } from '@ecopages/file-system';
import { ContentScanner } from '../content-scanner.ts';

const contentRoot = '/tmp/content';

afterEach(() => {
	vi.restoreAllMocks();
});

describe('ContentScanner updateEntryForPath', () => {
	it('returns manifest or no-op for change events, never structure', async () => {
		const introPath = join(contentRoot, 'intro.mdx');
		vi.spyOn(fileSystem, 'glob').mockResolvedValue(['intro.mdx']);
		vi.spyOn(fileSystem, 'readFile').mockImplementation(async (filePath) => {
			if (filePath === introPath) {
				return '---\ntitle: Intro\n---\n# Intro';
			}

			return '---\ntitle: Intro\n---\n# Intro updated';
		});

		const scanner = new ContentScanner({
			contentRoot,
			schema: {
				'~standard': {
					version: 1,
					vendor: 'test',
					validate: (value: unknown) => ({ value: value as { title: string } }),
				},
			},
		});

		await scanner.getManifest();
		const result = await scanner.updateEntryForPath(introPath, 'change');

		expect(result).not.toBe('structure');
	});
});

describe('ContentScanner slugFromRelativePath ordering', () => {
	const schema = {
		'~standard': {
			version: 1 as const,
			vendor: 'test',
			validate: (value: unknown) => ({ value: value as { title: string } }),
		},
	};

	it('strips multi-dot extensions cleanly even when declared before plain .mdx', async () => {
		vi.spyOn(fileSystem, 'glob').mockResolvedValue([
			'tests/shared-demo.radiant.mdx',
			'tests/shared-demo-react.react.mdx',
			'intro.mdx',
		]);
		vi.spyOn(fileSystem, 'readFile').mockResolvedValue('---\ntitle: Intro\n---\n# Intro');

		const scanner = new ContentScanner({
			contentRoot,
			extensions: ['.mdx', '.radiant.mdx', '.react.mdx'],
			schema,
		});

		const manifest = await scanner.getManifest();

		expect(manifest.map((entry) => entry.slug)).toEqual(['intro', 'tests/shared-demo', 'tests/shared-demo-react']);
	});
});
