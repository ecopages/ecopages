import jscodeshift from 'jscodeshift';
import { describe, expect, it, vi } from 'vitest';
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

	it('inspects directory-style role entries', () => {
		expect(runTransform("import { finalizeEcoPagesConfig } from '@ecopages/core/internal/finalize-config';")).toBe(
			"import { finalizeEcoPagesConfig } from '@ecopages/core/config';",
		);
	});

	it('maps known client and Integration helpers only when the role entry exports them', () => {
		const source = [
			"import { defineDevTool } from '@ecopages/core/dev-toolbar/define-dev-tool';",
			"import { resolveLayoutShellProps } from '@ecopages/core/route-renderer/orchestration/document-shell/layout-shell-props.service';",
		].join('\n');
		const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

		expect(runTransform(source)).toBe(
			[
				"import { defineDevTool } from '@ecopages/core/client';",
				"import { resolveLayoutShellProps } from '@ecopages/core/integration';",
			].join('\n'),
		);
		expect(warning).not.toHaveBeenCalled();
		warning.mockRestore();
	});

	it('leaves imports unchanged and reports names missing from a role entry', () => {
		const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

		expect(
			runTransform(
				"import { HASHED_BROWSER_ASSET_INDEX_FILENAME } from '@ecopages/core/assets/hashed-browser-asset';",
			),
		).toBeNull();
		expect(warning).toHaveBeenCalledWith(
			expect.stringContaining("'HASHED_BROWSER_ASSET_INDEX_FILENAME' is not exported"),
		);
		warning.mockRestore();
	});

	it('warns on dynamic imports and require calls but rewrites resolution calls', () => {
		const source = [
			"const scroll = await import('@ecopages/core/client/scroll');",
			"const scripts = require('@ecopages/core/client/navigation-scripts');",
			"const contract = import.meta.resolve('@ecopages/core/dev-toolbar/build-error-contract');",
			"const tool = require.resolve('@ecopages/core/dev-toolbar/define-dev-tool');",
		].join('\n');
		const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

		expect(runTransform(source)).toBe(
			[
				"const scroll = await import('@ecopages/core/client/scroll');",
				"const scripts = require('@ecopages/core/client/navigation-scripts');",
				"const contract = import.meta.resolve('@ecopages/core/client');",
				"const tool = require.resolve('@ecopages/core/client');",
			].join('\n'),
		);
		expect(warning).toHaveBeenCalledWith(expect.stringContaining('dynamic module access cannot be verified'));
		expect(warning).toHaveBeenCalledTimes(2);
		warning.mockRestore();
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
