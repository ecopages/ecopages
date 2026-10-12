/** @jsxImportSource @ecopages/jsx */
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { eco, type EcoComponent, type HtmlTemplateProps } from '@ecopages/core';
import { createMarkupNodeLike, type JsxCustomElementAttributes, type JsxRenderable } from '@ecopages/jsx';
import { installLightDomShim } from '@ecopages/radiant/server/light-dom-shim';
import { createTestAppConfig } from '@ecopages/testing';
import {
	CUSTOM_ELEMENT_SSR_PRELOAD_CACHE_SCOPES,
	invalidateCustomElementScriptPreload,
} from '@ecopages/core/route-renderer/orchestration/custom-element-scripts/custom-element-script-preloader';
import { EcopagesJsxRenderer } from '../ecopages-jsx-renderer.ts';

declare module '@ecopages/jsx' {
	interface JsxCustomIntrinsicElements {
		'ecopages-jsx-ssr-preload-radiant-host': JsxCustomElementAttributes<HTMLElement>;
	}
}

const PACKAGE_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const RADIANT_HOST_SCRIPT = fileURLToPath(new URL('./fixtures/ssr-preload-radiant-host.script.tsx', import.meta.url));

const Config = await createTestAppConfig();

const HtmlTemplate = ({ children }: { children: JsxRenderable }) => (
	<html>
		<body>
			<main>{children}</main>
		</body>
	</html>
);

class TestEcopagesJsxRenderer extends EcopagesJsxRenderer {
	protected override async getHtmlTemplate(): Promise<EcoComponent<HtmlTemplateProps>> {
		return HtmlTemplate as unknown as EcoComponent<HtmlTemplateProps>;
	}

	protected override async resolveDependencies(): Promise<[]> {
		return [];
	}
}

describe('Ecopages JSX SSR script preload integration', () => {
	/**
	 * @remarks
	 * The Bun case fakes Bun's globals on Node. Bun used to import the script
	 * source natively, which drops the server loaders for its CSS, MDX and asset
	 * imports. The compiled module in the work directory shows the script went
	 * through the server-module loader instead.
	 */
	it.each(['Node', 'Bun'])(
		'server-renders a RadiantElement registered from a tsx script through the server-module loader on %s',
		async (runtime) => {
			if (runtime === 'Bun') {
				vi.stubGlobal('Bun', { version: '1.4.2' });
				Object.defineProperty(process.versions, 'bun', { value: '1.4.2', configurable: true });
			}
			invalidateCustomElementScriptPreload(
				RADIANT_HOST_SCRIPT,
				CUSTOM_ELEMENT_SSR_PRELOAD_CACHE_SCOPES.ecopagesJsx,
			);
			installLightDomShim();
			const tempDir = await mkdtemp(path.join(PACKAGE_ROOT, '.eco-ssr-preload-'));
			const hostFile = path.join(path.dirname(RADIANT_HOST_SCRIPT), 'host.tsx');

			try {
				const appConfig = await createTestAppConfig({
					rootDir: PACKAGE_ROOT,
					workDir: tempDir,
				});
				const Host = eco.component<{}, JsxRenderable>({
					integration: 'ecopages-jsx',
					identity: { id: 'ssr-preload-radiant-host', file: hostFile, integration: 'ecopages-jsx' },
					dependencies: {
						scripts: [{ src: `./${path.basename(RADIANT_HOST_SCRIPT)}`, ssr: true }],
					},
					render: () => <ecopages-jsx-ssr-preload-radiant-host />,
				});

				const renderer = new TestEcopagesJsxRenderer({
					appConfig,
					assetProcessingService: {
						processDependencies: vi.fn(async () => []),
					} as never,
					runtimeOrigin: 'http://localhost:3000',
					resolvedIntegrationDependencies: [],
					jsxConfig: {
						radiantSsrEnabled: true,
					},
				});

				const result = await renderer.renderComponent({
					component: Host,
					props: {},
				});

				expect(await readdir(tempDir, { recursive: true })).toContainEqual(
					expect.stringMatching(/ssr-preload-radiant-host\.script-[0-9a-f]+\.mjs$/),
				);
				expect(result.html).toContain('data-ssr-preload-radiant-host="true">1</span>');
				expect(result.html).toContain('data-hydration');
				expect(result.html).toContain('data-hydration-key="label"');
			} finally {
				vi.unstubAllGlobals();
				delete process.versions.bun;
				await rm(tempDir, { recursive: true, force: true });
			}
		},
	);

	it('does not register Radiant hosts when dependencies.scripts omit ssr true', async () => {
		installLightDomShim();
		const noSsrTag = 'ecopages-jsx-ssr-preload-host-no-ssr';
		const tempDir = await mkdtemp(path.join(tmpdir(), 'ecopages-jsx-ssr-preload-host-'));
		const hostFile = path.join(tempDir, 'host.tsx');
		const scriptFile = path.join(tempDir, 'ssr-preload-host.script.mjs');

		try {
			await writeFile(
				scriptFile,
				[
					`class SsrPreloadHost extends HTMLElement {`,
					'\trenderHostToString() {',
					`\t\treturn '<${noSsrTag}><span data-ssr-preload-host-marker="true">registered</span></${noSsrTag}>';`,
					'\t}',
					'}',
					`customElements.define('${noSsrTag}', SsrPreloadHost);`,
				].join('\n'),
			);

			const Host = eco.component<{}, JsxRenderable>({
				integration: 'ecopages-jsx',
				identity: { id: 'ssr-preload-host', file: hostFile, integration: 'ecopages-jsx' },
				dependencies: {
					scripts: [{ src: './ssr-preload-host.script.mjs' }],
				},
				render: () => createMarkupNodeLike(`<${noSsrTag} data-ssr-preload-host-marker="probe"></${noSsrTag}>`),
			});

			const renderer = new TestEcopagesJsxRenderer({
				appConfig: Config,
				assetProcessingService: {
					processDependencies: vi.fn(async () => []),
				} as never,
				runtimeOrigin: 'http://localhost:3000',
				resolvedIntegrationDependencies: [],
				jsxConfig: {
					radiantSsrEnabled: true,
				},
			});

			const result = await renderer.renderComponent({
				component: Host,
				props: {},
			});

			expect(result.html).not.toContain('data-ssr-preload-host-marker="true"');
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});
});
