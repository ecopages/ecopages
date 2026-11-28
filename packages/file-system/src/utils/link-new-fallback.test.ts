import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { path } from '../path.ts';

const linkFailure = vi.hoisted(() => ({ code: undefined as string | undefined }));

vi.mock('node:fs', async (importOriginal) => {
	const actual = await importOriginal<typeof import('node:fs')>();
	return {
		...actual,
		linkSync: (source: string, destination: string) => {
			if (linkFailure.code) throw Object.assign(new Error(linkFailure.code), { code: linkFailure.code });
			return actual.linkSync(source, destination);
		},
	};
});

vi.mock('node:fs/promises', async (importOriginal) => {
	const actual = await importOriginal<typeof import('node:fs/promises')>();
	return {
		...actual,
		link: async (source: string, destination: string) => {
			if (linkFailure.code) throw Object.assign(new Error(linkFailure.code), { code: linkFailure.code });
			return actual.link(source, destination);
		},
	};
});

const { nodeFs } = await import('../adapters/node.ts');

describe('linkNew on a volume that cannot hold the link', () => {
	let testDir: string;
	let source: string;
	let destination: string;

	beforeEach(() => {
		testDir = path.fromNative(mkdtempSync(path.join(tmpdir(), 'eco-fs-link-new-')));
		source = path.join(testDir, 'seed.tmp');
		destination = path.join(testDir, 'catalog.db');
		writeFileSync(source, 'seeded');
	});

	afterEach(() => {
		linkFailure.code = undefined;
		rmSync(testDir, { recursive: true, force: true });
	});

	describe.each(['EPERM', 'EXDEV', 'EISDIR', 'ENOTSUP', 'EOPNOTSUPP', 'ENOSYS'])('after %s', (code) => {
		beforeEach(() => {
			linkFailure.code = code;
		});

		it('copies the source to an absent destination and keeps the source', () => {
			expect(nodeFs.linkNew(source, destination)).toBe(true);

			expect(readFileSync(destination, 'utf8')).toBe('seeded');
			expect(nodeFs.exists(source)).toBe(true);
		});

		it('copies the source to an absent destination asynchronously', async () => {
			expect(await nodeFs.linkNewAsync(source, destination)).toBe(true);

			expect(readFileSync(destination, 'utf8')).toBe('seeded');
		});

		it('returns false and leaves an existing destination as it is', async () => {
			writeFileSync(destination, 'carts');

			expect(nodeFs.linkNew(source, destination)).toBe(false);
			expect(await nodeFs.linkNewAsync(source, destination)).toBe(false);

			expect(readFileSync(destination, 'utf8')).toBe('carts');
		});

		it('returns false for a destination that is a dangling symlink', async () => {
			symlinkSync(path.join(testDir, 'missing-target'), destination);

			expect(nodeFs.linkNew(source, destination)).toBe(false);
			expect(await nodeFs.linkNewAsync(source, destination)).toBe(false);
		});

		it('throws ENOENT for a missing source', async () => {
			const missing = path.join(testDir, 'missing');

			expect(() => nodeFs.linkNew(missing, destination)).toThrow(expect.objectContaining({ code: 'ENOENT' }));
			await expect(nodeFs.linkNewAsync(missing, destination)).rejects.toMatchObject({ code: 'ENOENT' });
		});
	});

	it('removes the destination it created when the copy fails, and reports the error', async () => {
		linkFailure.code = 'EPERM';
		const directory = path.join(testDir, 'not-a-file');
		mkdirSync(directory);

		expect(() => nodeFs.linkNew(directory, destination)).toThrow();
		await expect(nodeFs.linkNewAsync(directory, destination)).rejects.toThrow();

		expect(nodeFs.exists(destination)).toBe(false);
	});

	it('copies a file larger than one chunk byte for byte', async () => {
		linkFailure.code = 'EPERM';
		const content = Buffer.alloc(3 * 64 * 1024 + 17, 'ecopages');
		writeFileSync(source, content);

		expect(await nodeFs.linkNewAsync(source, destination)).toBe(true);
		expect(readFileSync(destination).equals(content)).toBe(true);

		rmSync(destination);
		expect(nodeFs.linkNew(source, destination)).toBe(true);
		expect(readFileSync(destination).equals(content)).toBe(true);
	});

	it('reports a link failure of another kind without copying', async () => {
		linkFailure.code = 'EIO';

		expect(() => nodeFs.linkNew(source, destination)).toThrow(expect.objectContaining({ code: 'EIO' }));
		await expect(nodeFs.linkNewAsync(source, destination)).rejects.toMatchObject({ code: 'EIO' });
		expect(nodeFs.exists(destination)).toBe(false);
	});
});
