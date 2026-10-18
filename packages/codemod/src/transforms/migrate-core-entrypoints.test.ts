import jscodeshift from 'jscodeshift';
import { describe, expect, it } from 'vitest';
import transform from './migrate-core-entrypoints.ts';

const j = jscodeshift.withParser('tsx');

function runTransform(source: string): string | null {
	return transform({ path: 'fixture.tsx', source }, { jscodeshift: j }, {});
}

describe('migrate-core-entrypoints', () => {
	it('maps deep Integration imports and re-exports to their role entry', () => {
		const source = [
			"import { createIntegrationRenderer, type IntegrationRenderer } from '@ecopages/core/route-renderer/orchestration/integration-renderer';",
			"export { StringMarkupRenderer } from '@ecopages/core/route-renderer/orchestration/string-markup-renderer';",
		].join('\n');

		expect(runTransform(source)).toBe(
			[
				"import { createIntegrationRenderer, type IntegrationRenderer } from '@ecopages/core/integration';",
				"export { StringMarkupRenderer } from '@ecopages/core/integration';",
			].join('\n'),
		);
	});

	it('maps the browser layout normalizer to the Client entry', () => {
		expect(
			runTransform("import { ensurePageConfigLayouts } from '@ecopages/core/eco/page-layout-normalization';"),
		).toBe("import { ensurePageConfigLayouts } from '@ecopages/core/client';");
	});

	it('rewrites dynamic imports and import.meta.resolve calls', () => {
		const source = [
			"const scroll = await import('@ecopages/core/client/scroll');",
			"const contract = import.meta.resolve('@ecopages/core/dev-toolbar/build-error-contract');",
		].join('\n');

		expect(runTransform(source)).toBe(
			[
				"const scroll = await import('@ecopages/core/client');",
				"const contract = import.meta.resolve('@ecopages/core/client');",
			].join('\n'),
		);
	});

	it('leaves retained entries and unknown package paths unchanged', () => {
		const source = [
			"const runtime = import.meta.resolve('@ecopages/core/hmr/client/hmr-runtime');",
			"const writer = import.meta.resolve('@ecopages/core/config/write-types');",
			"import { eco } from '@ecopages/core';",
		].join('\n');

		expect(runTransform(source)).toBeNull();
	});
});
