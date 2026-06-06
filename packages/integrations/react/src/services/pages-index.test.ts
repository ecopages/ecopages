import { describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PagesIndex } from './pages-index.ts';

function makeFixture(): { root: string; pagesDir: string } {
	const root = mkdtempSync(path.join(tmpdir(), 'ecopages-pages-index-'));
	const pagesDir = path.join(root, 'src', 'pages');
	mkdirSync(pagesDir, { recursive: true });
	return { root, pagesDir };
}

describe('PagesIndex', () => {
	it('refresh() indexes files matching the configured extensions', async () => {
		const { root, pagesDir } = makeFixture();
		try {
			writeFileSync(path.join(pagesDir, 'index.tsx'), 'export const x = 1;', 'utf-8');
			writeFileSync(path.join(pagesDir, 'about.kita.tsx'), 'export const y = 2;', 'utf-8');
			writeFileSync(path.join(pagesDir, 'not-a-page.css'), '.x{}', 'utf-8');

			const index = new PagesIndex({ pagesDir, extensions: ['.tsx', '.kita.tsx'] });
			await index.refresh();

			const files = index.list();
			expect(files.length).toBe(2);
			expect(files.some((f) => f.endsWith('index.tsx'))).toBe(true);
			expect(files.some((f) => f.endsWith('about.kita.tsx'))).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it('add() and remove() are idempotent and maintain the set', () => {
		const { root, pagesDir } = makeFixture();
		try {
			const index = new PagesIndex({ pagesDir });
			const file = path.join(pagesDir, 'foo.tsx');
			index.add(file);
			index.add(file);
			expect(index.has(file)).toBe(true);
			expect(index.size).toBe(1);
			index.remove(file);
			index.remove(file);
			expect(index.has(file)).toBe(false);
			expect(index.size).toBe(0);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it('list() returns sorted output', async () => {
		const { root, pagesDir } = makeFixture();
		try {
			writeFileSync(path.join(pagesDir, 'zeta.tsx'), 'x', 'utf-8');
			writeFileSync(path.join(pagesDir, 'alpha.tsx'), 'x', 'utf-8');
			writeFileSync(path.join(pagesDir, 'mike.tsx'), 'x', 'utf-8');

			const index = new PagesIndex({ pagesDir });
			await index.refresh();
			const files = index.list();
			expect(files[0]?.endsWith('alpha.tsx')).toBe(true);
			expect(files.at(-1)?.endsWith('zeta.tsx')).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it('skips .ecopages-node. sentinels', async () => {
		const { root, pagesDir } = makeFixture();
		try {
			writeFileSync(path.join(pagesDir, 'real.tsx'), 'x', 'utf-8');
			mkdirSync(path.join(pagesDir, 'foo.ecopages-node.baz'), { recursive: true });
			writeFileSync(path.join(pagesDir, 'foo.ecopages-node.baz', 'a.tsx'), 'x', 'utf-8');

			const index = new PagesIndex({ pagesDir });
			await index.refresh();
			const files = index.list();
			expect(files.length).toBe(1);
			expect(files[0]?.endsWith('real.tsx')).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it('isPageEntrypoint predicate filters files', async () => {
		const { root, pagesDir } = makeFixture();
		try {
			writeFileSync(path.join(pagesDir, 'page.tsx'), 'x', 'utf-8');
			writeFileSync(path.join(pagesDir, 'fixture.tsx'), 'x', 'utf-8');

			const index = new PagesIndex({
				pagesDir,
				isPageEntrypoint: (p) => !p.endsWith('fixture.tsx'),
			});
			await index.refresh();
			const files = index.list();
			expect(files.length).toBe(1);
			expect(files[0]?.endsWith('page.tsx')).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it('refreshedAt is updated by refresh()', async () => {
		const { root, pagesDir } = makeFixture();
		try {
			const index = new PagesIndex({ pagesDir });
			expect(index.refreshedAt).toBe(0);
			await index.refresh();
			expect(index.refreshedAt).toBeGreaterThan(0);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
