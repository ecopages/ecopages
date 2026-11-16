import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import jscodeshift from 'jscodeshift';
import prettier from 'prettier';
import { describe, expect, it, vi } from 'vitest';
import transform from './migrate-middleware-locals.ts';
import { formatMigrationBrief, run } from '../cli.ts';

const fixturesDir = path.join(
	path.dirname(fileURLToPath(import.meta.url)),
	'__fixtures__',
	'migrate-middleware-locals',
);

const j = jscodeshift.withParser('tsx');

async function runTransform(
	source: string,
	report: (message: string) => void = () => {},
	fixturePath = 'fixture.ts',
): Promise<string | null> {
	const result = transform({ path: fixturePath, source }, { jscodeshift: j, report } as never, {});
	if (!result) {
		return null;
	}
	const config = await prettier.resolveConfig(fixturePath);
	return prettier.format(result, { ...config, parser: 'typescript' });
}

function readFixture(name: string, extension: 'input' | 'output', ext = 'ts'): string {
	return readFileSync(path.join(fixturesDir, `${name}.${extension}.${ext}`), 'utf-8');
}

describe('migrate-middleware-locals', () => {
	it.each(['basic', 'keeps-other-imports'])('moves the assignments into next() in %s', async (name) => {
		expect(await runTransform(readFixture(name, 'input'))).toBe(readFixture(name, 'output'));
	});

	it('is idempotent', async () => {
		const once = await runTransform(readFixture('basic', 'input'));
		expect(once).not.toBeNull();
		expect(await runTransform(once as string)).toBeNull();
	});

	it('leaves migrated code and foreign Middleware types unchanged', async () => {
		expect(await runTransform(readFixture('already-migrated', 'input'))).toBeNull();
		expect(await runTransform(readFixture('foreign-types', 'input'))).toBeNull();
	});

	it('leaves assignments it cannot move unchanged and reports each with its line', async () => {
		const report = vi.fn();
		expect(await runTransform(readFixture('unmovable', 'input'), report)).toBeNull();
		expect(report).toHaveBeenCalledTimes(3);
		expect(report).toHaveBeenCalledWith(expect.stringContaining('fixture.ts:5 ctx.locals assignment not moved'));
		expect(report).toHaveBeenCalledWith(expect.stringContaining('fixture.ts:11'));
		expect(report).toHaveBeenCalledWith(expect.stringContaining('fixture.ts:19'));
	});

	it('refuses to move an assignment when later code can observe ctx before next() runs', async () => {
		const report = vi.fn();
		expect(await runTransform(readFixture('reordered', 'input'), report)).toBeNull();
		expect(report).toHaveBeenCalledTimes(3);
		for (const line of [4, 11, 18]) {
			expect(report).toHaveBeenCalledWith(
				expect.stringContaining(`fixture.ts:${line} ctx.locals assignment not moved: the middleware uses ctx`),
			);
		}
	});

	it('hoists a value that later code could change, so next() provides the value at the assignment', async () => {
		expect(await runTransform(readFixture('hoisted', 'input'))).toBe(readFixture('hoisted', 'output'));
	});

	it('refuses an API middleware that reads what a createMiddleware stage does not receive', async () => {
		const report = vi.fn();
		expect(await runTransform(readFixture('api-context', 'input'), report)).toBeNull();
		expect(report).toHaveBeenCalledTimes(2);
		for (const line of [4, 9]) {
			expect(report).toHaveBeenCalledWith(
				expect.stringContaining(
					`fixture.ts:${line} ctx.locals assignment not moved: the middleware reads ctx.query`,
				),
			);
		}
	});

	it('reports an EcoMiddleware annotation without rewriting it', async () => {
		const report = vi.fn();
		expect(await runTransform(readFixture('eco-middleware', 'input'), report)).toBeNull();
		expect(report).toHaveBeenCalledWith(expect.stringContaining('fixture.ts:5 EcoMiddleware<Context> is removed'));
	});

	it('moves the locals a dynamic page reads in render into a new props hook and drops requires', async () => {
		const source = readFixture('page-render-locals', 'input', 'tsx');
		const output = await runTransform(source, () => {}, 'page.tsx');
		expect(output).toBe(readFixture('page-render-locals', 'output', 'tsx'));
		expect(await runTransform(output as string, () => {}, 'page.tsx')).toBeNull();
	});

	it('returns from props only the member chain render reads, never the object it is read from', async () => {
		const source = readFixture('page-render-member-chain', 'input', 'tsx');
		expect(await runTransform(source, () => {}, 'page.tsx')).toBe(
			readFixture('page-render-member-chain', 'output', 'tsx'),
		);
	});

	it('reports a page whose render reads locals other than as a member chain value, or under a route key', async () => {
		const report = vi.fn();
		const source = readFixture('page-render-unsafe', 'input', 'tsx');
		expect(await runTransform(source, report, 'page.tsx')).toBeNull();
		expect(report).toHaveBeenCalledTimes(9);
		const reasons: Array<[number[], string]> = [
			[[5, 10, 15, 20, 48], 'render reads locals other than as the value of a member chain'],
			[[25, 30], 'render reads locals.params, locals.query'],
			[[35, 40], 'render reads locals under a name that another read or render already uses'],
		];
		for (const [lines, reason] of reasons) {
			for (const line of lines) {
				expect(report).toHaveBeenCalledWith(
					expect.stringMatching(
						new RegExp(`page\\.tsx:${line} requires is removed.*${reason.replaceAll('.', '\\.')}`),
					),
				);
			}
		}
	});

	it('reports a page it cannot move, by its requires or its first locals read', async () => {
		const report = vi.fn();
		const source = readFixture('page-requires', 'input', 'tsx');
		expect(await runTransform(source, report, 'page.tsx')).toBeNull();
		expect(report).toHaveBeenCalledTimes(2);
		expect(report).toHaveBeenCalledWith(expect.stringContaining('page.tsx:6 requires is removed'));
		expect(report).toHaveBeenCalledWith(expect.stringContaining('page.tsx:16 requires is removed'));
	});

	it('reports a RequestLocals augmentation of @ecopages/core without rewriting it', async () => {
		const report = vi.fn();
		const source = readFixture('request-locals-augmentation', 'input');
		expect(await runTransform(source, report, 'modules.d.ts')).toBeNull();
		expect(report).toHaveBeenCalledTimes(1);
		expect(report).toHaveBeenCalledWith(
			expect.stringContaining('modules.d.ts:6 the global RequestLocals interface is removed'),
		);
	});
});

describe('migration brief', () => {
	it('lists the API change, each manual case, the docs and an agent prompt', () => {
		const brief = formatMigrationBrief([
			{ kind: 'eco-middleware', file: 'src/a.ts', line: 5, reason: 'EcoMiddleware<Context> is removed' },
			{ kind: 'locals-assignment', file: 'src/b.ts', line: 3, reason: 'not moved' },
			{ kind: 'page-requires', file: 'src/c.tsx', line: 7, reason: 'requires is removed' },
			{ kind: 'request-locals-augmentation', file: 'modules.d.ts', line: 6, reason: 'RequestLocals is removed' },
		]);
		expect(brief).toMatch(/^MIGRATION BRIEF/);
		expect(brief).toContain('next({ ... })');
		expect(brief).toContain('  src/a.ts:5 EcoMiddleware<Context> is removed');
		expect(brief).toContain('  src/b.ts:3 not moved');
		expect(brief).toContain('  src/c.tsx:7 requires is removed');
		expect(brief).toContain('  modules.d.ts:6 RequestLocals is removed');
		expect(brief).toContain('the global RequestLocals interface is removed');
		expect(brief).toContain('props: ({ locals }: { locals: { session: Session } })');
		expect(brief).toContain('RequestLocals declarations');
		expect(brief).toContain('render no longer receives locals');
		expect(brief).toContain('props: ({ locals }) => ({ user: locals.session.user })');
		expect(brief).toContain('https://ecopages.app/docs/core/request-locals');
		expect(brief).toContain('https://ecopages.app/docs/reference/typescript');
		expect(brief.split('\n').at(-1)).toMatch(/^Agent prompt:/);
	});

	it('is printed by the CLI after a run over a directory', () => {
		const dir = mkdtempSync(path.join(tmpdir(), 'codemod-brief-'));
		const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
		try {
			writeFileSync(path.join(dir, 'legacy.ts'), readFixture('eco-middleware', 'input'));
			writeFileSync(path.join(dir, 'auth.ts'), readFixture('basic', 'input'));
			expect(run(['migrate-middleware-locals', dir, '--dry'])).toBe(0);
			const output = write.mock.calls.map(([chunk]) => String(chunk)).join('');
			expect(output).toContain('MIGRATION BRIEF');
			expect(output).toContain('legacy.ts:5 EcoMiddleware<Context> is removed');
			expect(output).toContain('Agent prompt:');
		} finally {
			write.mockRestore();
			rmSync(dir, { recursive: true, force: true });
		}
	}, 60_000);
});
