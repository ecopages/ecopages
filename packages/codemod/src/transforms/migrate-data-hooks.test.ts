import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import jscodeshift from 'jscodeshift';
import prettier from 'prettier';
import { describe, expect, it, vi } from 'vitest';
import transform from './migrate-data-hooks.ts';

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '__fixtures__', 'migrate-data-hooks');

const j = jscodeshift.withParser('tsx');

async function runTransform(source: string, report: (message: string) => void = () => {}): Promise<string | null> {
	const fixturePath = 'fixture.tsx';
	const result = transform({ path: fixturePath, source }, { jscodeshift: j, report } as never, {});
	if (!result) {
		return null;
	}
	const config = await prettier.resolveConfig(fixturePath);
	return prettier.format(result, { ...config, parser: 'typescript' });
}

function readFixture(name: string, extension: 'input' | 'output'): string {
	return readFileSync(path.join(fixturesDir, `${name}.${extension}.tsx`), 'utf-8');
}

describe('migrate-data-hooks', () => {
	it.each(['envelopes', 'expression-body', 'method-and-shorthand', 'computed-return'])(
		'renames the hooks and drops the envelopes in %s',
		async (name) => {
			expect(await runTransform(readFixture(name, 'input'))).toBe(readFixture(name, 'output'));
		},
	);

	it('leaves a page that already uses props and paths unchanged', async () => {
		expect(await runTransform(readFixture('already-migrated', 'input'))).toBeNull();
	});

	it('leaves a hook it cannot resolve unchanged and reports it', async () => {
		const report = vi.fn();
		expect(await runTransform(readFixture('unresolvable', 'input'), report)).toBeNull();
		expect(report).toHaveBeenCalledWith(expect.stringContaining('staticProps'));
	});

	it('reports a hook rewritten as an awaited member access', async () => {
		const report = vi.fn();
		const output = await runTransform(readFixture('computed-return', 'input'), report);
		expect(output).toContain('(await result).props');
		expect(report).toHaveBeenCalledTimes(2);
		expect(report).toHaveBeenCalledWith(expect.stringContaining('(await value).props'));
	});

	it('leaves a synchronous hook with a computed return unchanged and reports it', async () => {
		const report = vi.fn();
		expect(await runTransform(readFixture('sync-unresolvable', 'input'), report)).toBeNull();
		expect(report).toHaveBeenCalledOnce();
	});

	it('does not rename GetStaticProps imported from another package', async () => {
		expect(await runTransform(readFixture('foreign-types', 'input'))).toBeNull();
	});

	it('is idempotent', async () => {
		const once = await runTransform(readFixture('envelopes', 'input'));
		expect(once).not.toBeNull();
		expect(await runTransform(once as string)).toBeNull();
	});
	describe('props context', () => {
		const wrap = (hook: string) =>
			`import { eco } from '@ecopages/core';\nexport default eco.page({ staticProps: ${hook}, render: () => null });\n`;

		it.each([
			[
				'a destructured pathname that reads params',
				'async ({ pathname }) => ({ props: { slug: pathname.params.slug } })',
				'({ params })',
				'params.slug',
			],
			[
				'a nested pathname destructure',
				'async ({ pathname: { params } }) => ({ props: { slug: params.slug } })',
				'({ params })',
				'params.slug',
			],
			[
				'a renamed pathname',
				'async ({ pathname: path }) => ({ props: { slug: path.params.slug } })',
				'({ params })',
				'params.slug',
			],
			[
				'a pathname beside other fields',
				'async ({ pathname, appConfig }) => ({ props: { slug: pathname.params.slug, appConfig } })',
				'({ params, appConfig })',
				'params.slug',
			],
			[
				'a context identifier',
				'async (ctx) => ({ props: { slug: ctx.pathname.params.slug } })',
				'(ctx)',
				'ctx.params.slug',
			],
		])('rewrites %s', async (_name, hook, signature, read) => {
			const report = vi.fn();
			const output = await runTransform(wrap(hook), report);
			expect(output).toContain(signature);
			expect(output).toContain(read);
			expect(output).not.toContain('pathname');
			expect(report).not.toHaveBeenCalled();
		});

		it.each([
			[
				'a renamed nested params',
				'async ({ pathname: { params: p } }) => ({ props: { slug: p.slug } })',
				'({ params: p })',
			],
			[
				'a destructured nested slug',
				'async ({ pathname: { params: { slug } } }) => ({ props: { slug } })',
				'({ params: { slug } })',
			],
			[
				'a rest sibling',
				'async ({ pathname: { params }, ...rest }) => ({ props: { slug: params.slug, rest } })',
				'({ params, ...rest })',
			],
			[
				'a plain context read',
				'async (ctx) => ({ props: { slug: ctx.pathname.params.slug, o: ctx.runtimeOrigin } })',
				'ctx.params.slug',
			],
		])('rewrites %s', async (_name, hook, expected) => {
			const report = vi.fn();
			const output = await runTransform(wrap(hook), report);
			expect(output).toContain(expected);
			expect(output).not.toContain('pathname');
			expect(report).not.toHaveBeenCalled();
		});

		it('rewrites an object method hook', async () => {
			const report = vi.fn();
			const output = await runTransform(
				"import { eco } from '@ecopages/core';\nexport default eco.page({ staticProps({ pathname }) { return { props: { slug: pathname.params.slug } }; }, render: () => null });\n",
				report,
			);
			expect(output).toContain('props({ params })');
			expect(output).not.toContain('pathname');
			expect(report).not.toHaveBeenCalled();
		});

		it.each([
			['a context passed on', 'async (ctx) => ({ props: await load(ctx) })'],
			['a context spread', 'async (ctx) => ({ props: { ...ctx } })'],
		])('renames the hook and reports it for %s', async (_name, hook) => {
			const report = vi.fn();
			const output = await runTransform(wrap(hook), report);
			expect(output).toContain('props:');
			expect(report).toHaveBeenCalledWith(expect.stringContaining('reads pathname'));
		});

		it('renames the StaticPath type imported from an Ecopages package', async () => {
			const output = await runTransform(
				"import type { StaticPath } from '@ecopages/core';\nexport const paths: StaticPath[] = [];\n",
			);
			expect(output).toContain("import type { PagePath } from '@ecopages/core';");
			expect(output).toContain('PagePath[]');
		});

		it.each([
			['pathname passed on whole', 'async ({ pathname }) => ({ props: { slug: lookup(pathname) } })'],
			[
				'pathname read for another field',
				'async ({ pathname }) => ({ props: { slug: pathname.params.slug, other: pathname.other } })',
			],
			[
				'a context identifier reading pathname whole',
				'async (ctx) => ({ props: { slug: lookup(ctx.pathname) } })',
			],
			[
				'a params binding that already exists',
				'async ({ pathname }) => { const params = 1; return { props: { slug: pathname.params.slug, params } }; }',
			],
			[
				'a context destructured in the body',
				'async (ctx) => { const { pathname } = ctx; return { props: { slug: pathname.params.slug } }; }',
			],
			[
				'a nested function that rebinds the context name',
				'async (ctx) => ({ props: { slug: [1].map((ctx) => ctx.pathname.params)[0] } })',
			],
			['a defaulted context identifier', 'async (ctx = {}) => ({ props: { slug: ctx.pathname.params.slug } })'],
			[
				'a defaulted destructure',
				'async ({ pathname: { params } } = defaults) => ({ props: { slug: params.slug } })',
			],
			['a string-literal key', "async ({ 'pathname': path }) => ({ props: { slug: path.other } })"],
			[
				'a typed pathname',
				'async ({ pathname }: { pathname: { params: Record<string, string> } }) => ({ props: { slug: pathname.params.slug } })',
			],
		])('renames the hook but keeps pathname and reports it for %s', async (_name, hook) => {
			const report = vi.fn();
			const output = await runTransform(wrap(hook), report);
			expect(output).toContain('props:');
			expect(output).toContain('pathname');
			expect(report).toHaveBeenCalledWith(expect.stringContaining('reads pathname'));
		});
	});
});
