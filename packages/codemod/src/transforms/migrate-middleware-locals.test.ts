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

	it('moves a local named locals into props, since render no longer receives locals', async () => {
		const source = [
			"import { eco } from '@ecopages/core';",
			"import { auth } from './auth';",
			'export default eco.page({',
			"\tcache: 'dynamic',",
			'\tmiddleware: [auth],',
			'\trender: ({ locals }) => <p>{locals.locals.x}</p>,',
			'});',
		].join('\n');
		const output = await runTransform(source, () => {}, 'page.tsx');
		expect(output).toContain('localsX: locals.locals.x');
		expect(output).toContain('<p>{localsX}</p>');
	});

	it('reports a page whose render reads locals other than as a member chain value, or under a route key', async () => {
		const report = vi.fn();
		const source = readFixture('page-render-unsafe', 'input', 'tsx');
		expect(await runTransform(source, report, 'page.tsx')).toBeNull();
		expect(report).toHaveBeenCalledTimes(9);
		const reasons: Array<[number[], string]> = [
			[[5, 10, 15, 20, 48], 'render reads locals other than as the value of a member chain'],
			[[25, 30], 'render reads locals.params or locals.query'],
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

describe('migrate-middleware-locals refusals', () => {
	const middleware = (body: string, annotation = 'FileRouteMiddleware', header = '') =>
		`import type { ${annotation.replace(/<.*/, '')} } from '@ecopages/core';\n${header}\nexport const a: ${annotation} = async (ctx, next) => {\n${body}\n};\n`;

	async function refused(source: string, reason: string, fixturePath = 'fixture.ts') {
		const report = vi.fn();
		expect(await runTransform(source, report, fixturePath)).toBeNull();
		expect(report).toHaveBeenCalledWith(expect.stringContaining(reason));
	}

	const page = (options: string) =>
		`import { eco } from '@ecopages/core';\nimport { auth } from './auth';\nexport default eco.page({ cache: 'dynamic', middleware: [auth], ${options} });\n`;

	it('refuses a render read that sits behind a check, which props would read on every request', async () => {
		await refused(
			page(
				`render: ({ locals }) => (locals.session ? <p>{locals.session.user.name}</p> : <a href="/login">login</a>)`,
			),
			'inside a condition',
			'page.tsx',
		);
		await refused(
			page(`render: ({ locals }) => <ul>{[1, 2].map((n) => <li key={n}>{locals.prefix}</li>)}</ul>`),
			'inside a condition',
			'page.tsx',
		);
	});

	it('refuses a render that reads a local and a member of it, which props would return whole', async () => {
		await refused(
			page(`render: ({ locals }) => <p title={String(locals.session)}>{locals.session.id}</p>`),
			'reads both a locals value and a member of it',
			'page.tsx',
		);
	});

	it('refuses a page with no middleware list, whose props would see no typed locals', async () => {
		await refused(
			`import { eco } from '@ecopages/core';\nexport default eco.page({ cache: 'dynamic', render: ({ locals }) => <p>{locals.user.name}</p> });\n`,
			'lists no middleware',
			'page.tsx',
		);
	});

	it('tells a static page to become dynamic to read locals in props', async () => {
		await refused(
			`import { eco } from '@ecopages/core';\nexport default eco.page({ requires: ['user'], render: ({ locals }) => <p>{locals.user.name}</p> });\n`,
			"make it cache: 'dynamic'",
			'page.tsx',
		);
	});

	it('refuses a render prop named with a reserved word', async () => {
		await refused(page(`render: ({ locals }) => <p>{locals.default}</p>`), 'reserved word', 'page.tsx');
	});

	it('binds a hoisted value whose key is a reserved word to a valid name', async () => {
		const output = await runTransform(
			middleware('ctx.locals.default = await load();\nctx.locals.class = compute();\nreturn next();'),
		);
		expect(output).toContain('const defaultLocal = await load();');
		expect(output).toContain('const classLocal = compute();');
		expect(output).toContain('default: defaultLocal');
	});

	it('refuses to move an assignment past code that can await, return or throw before next()', async () => {
		const reason = 'awaits, returns or throws between a ctx.locals assignment and next()';
		await refused(middleware('ctx.locals.user = 1;\nawait validate();\nreturn next();'), reason);
		await refused(
			middleware('ctx.locals.user = 1;\nif (bad()) return new Response(null, { status: 403 });\nreturn next();'),
			reason,
		);
		await refused(middleware('ctx.locals.a = 1;\nctx.locals.b = await load();\nreturn next();'), reason);
	});

	it('reports annotated middleware it cannot rewrite instead of skipping it', async () => {
		await refused(
			`import type { FileRouteMiddleware } from '@ecopages/core';\nexport const a: FileRouteMiddleware = async ({ locals }, next) => {\n\tlocals.user = 1;\n\treturn next();\n};\n`,
			'fixture.ts:3 ctx.locals assignment not moved: the middleware is not a block-bodied function',
		);
		await refused(middleware(`ctx.locals['user'] = 1;\nreturn next();`), 'only through a computed key');
		await refused(
			middleware('Object.assign(ctx.locals, { user: 1 });\nreturn next();'),
			'only through a computed key',
		);
	});

	it('reports a function that writes locals without a middleware annotation', async () => {
		await refused(
			`import type { FileRouteMiddlewareContext } from '@ecopages/core';\nexport async function a(ctx: FileRouteMiddlewareContext, next: () => Promise<Response>) {\n\tctx.locals.user = 1;\n\treturn next();\n}\n`,
			'fixture.ts:3 ctx.locals written by a function not annotated',
		);
	});

	it('rewrites a middleware checked with satisfies', async () => {
		const output = await runTransform(
			`import type { FileRouteMiddleware } from '@ecopages/core';\nexport const a = (async (ctx, next) => {\n\tctx.locals.user = 1;\n\treturn next();\n}) satisfies FileRouteMiddleware;\n`,
		);
		expect(output).toContain('export const a = createMiddleware(async (ctx, next) => {');
		expect(output).not.toContain('satisfies');
	});

	it('refuses an annotation with type arguments, whose request type createMiddleware does not take', async () => {
		await refused(
			middleware('ctx.locals.user = ctx.request.user;\nreturn next();', 'FileRouteMiddleware<BunRequest>'),
			'is annotated FileRouteMiddleware<...>',
		);
	});

	it('reuses an aliased createMiddleware import and refuses a name another binding owns', async () => {
		const output = await runTransform(
			`import type { FileRouteMiddleware } from '@ecopages/core';\nimport { createMiddleware as cm } from '@ecopages/core';\nexport const a: FileRouteMiddleware = async (ctx, next) => {\n\tctx.locals.user = 1;\n\treturn next();\n};\n`,
		);
		expect(output).toContain('export const a = cm(async');
		expect(output?.match(/import/g)).toHaveLength(1);
		await refused(
			middleware(
				'ctx.locals.user = 1;\nreturn next();',
				'FileRouteMiddleware',
				`import { createMiddleware } from 'hono/factory';`,
			),
			'createMiddleware already names something other than the @ecopages/core export',
		);
	});

	it('refuses a middleware the file uses other than in a middleware list', async () => {
		const body = 'ctx.locals.user = 1;\nreturn next();';
		await refused(
			`${middleware(body)}export const b = (ctx, next) => a(ctx, next);\n`,
			'is referenced on line 7 other than in a middleware list',
		);
		await refused(`${middleware(body)}const list = [a];\n`, 'is referenced on line 7');
		const listed = await runTransform(
			`${middleware(body)}import { eco } from '@ecopages/core';\nexport default eco.page({ middleware: [a], render: () => '' });\n`,
		);
		expect(listed).toContain('createMiddleware(');
	});

	it('indents rewritten lines the way the source does', () => {
		const source = middleware('  ctx.locals.user = await load();\n  return next();');
		const output = transform({ path: 'fixture.ts', source }, { jscodeshift: j, report: () => {} } as never, {});
		expect(output).toContain('next({');
		expect(output).not.toMatch(/^\t/m);
	});
});

describe('migration brief', () => {
	it('does not claim every middleware was migrated when nothing was reported', () => {
		expect(formatMigrationBrief([])).toContain('Nothing reported.');
	});

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
