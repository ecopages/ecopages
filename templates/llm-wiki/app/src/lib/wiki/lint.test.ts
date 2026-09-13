import { join } from 'node:path';
import { expect, test } from 'vitest';
import { lintWiki, type WikiLintFinding } from './lint';

const fixturesRoot = join(import.meta.dirname, 'fixtures');
const demoRoot = join(import.meta.dirname, '../../../..');

function byCode(findings: WikiLintFinding[], code: WikiLintFinding['code']): WikiLintFinding[] {
	return findings.filter((finding) => finding.code === code);
}

test('healthy vault has no findings', async () => {
	const root = join(fixturesRoot, 'healthy');
	const result = await lintWiki({
		wikiDir: join(root, 'wiki'),
		sourcesDir: join(root, 'sources'),
		wikiRoot: root,
	});
	expect(result.findings).toEqual([]);
});

test('broken-graph vault reports each finding by code and path', async () => {
	const root = join(fixturesRoot, 'broken-graph');
	const result = await lintWiki({
		wikiDir: join(root, 'wiki'),
		sourcesDir: join(root, 'sources'),
		wikiRoot: root,
	});

	expect(byCode(result.findings, 'broken-link')).toEqual([
		expect.objectContaining({
			code: 'broken-link',
			severity: 'error',
			page: 'wiki/app/broken.md',
			target: 'app/missing',
		}),
	]);
	expect(byCode(result.findings, 'orphan')).toEqual([
		expect.objectContaining({
			code: 'orphan',
			severity: 'error',
			page: 'wiki/app/orphan.md',
		}),
	]);
	expect(byCode(result.findings, 'missing-source')).toEqual([
		expect.objectContaining({
			code: 'missing-source',
			severity: 'error',
			page: 'wiki/app/missing-source.md',
			target: 'gone',
		}),
	]);
	expect(byCode(result.findings, 'recipe-path')).toEqual([
		expect.objectContaining({
			code: 'recipe-path',
			severity: 'error',
			page: 'wiki/recipe/stale.md',
			target: 'no-such.ts',
		}),
	]);
	expect(byCode(result.findings, 'uncited-source')).toEqual([
		expect.objectContaining({
			code: 'uncited-source',
			severity: 'warning',
			page: 'sources/uncited.md',
			target: 'uncited',
		}),
	]);
	expect(byCode(result.findings, 'sortspec-ghost')).toEqual([
		expect.objectContaining({
			code: 'sortspec-ghost',
			severity: 'warning',
			page: 'wiki/app/sortspec.md',
			target: 'Ghost Title',
		}),
	]);
});

test('bundled demo vault is clean', async () => {
	const result = await lintWiki({
		wikiDir: join(demoRoot, 'wiki'),
		sourcesDir: join(demoRoot, 'sources'),
		wikiRoot: demoRoot,
	});
	expect(result.findings).toEqual([]);
});
