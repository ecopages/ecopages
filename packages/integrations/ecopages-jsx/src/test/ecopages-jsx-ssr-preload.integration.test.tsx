/** @jsxImportSource @ecopages/jsx */
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { eco, type EcoComponent, type HtmlTemplateProps } from '@ecopages/core';
import { createMarkupNodeLike, type JsxCustomElementAttributes, type JsxRenderable } from '@ecopages/jsx';
import { installLightDomShim } from '@ecopages/radiant/server/light-dom-shim';
import { createTestAppConfig } from '@ecopages/testing';
import { EcopagesJsxRenderer } from '../ecopages-jsx-renderer.ts';

declare module '@ecopages/jsx' {
	interface JsxCustomIntrinsicElements {
		'ecopages-jsx-ssr-preload-host': JsxCustomElementAttributes<HTMLElement>;
	}
}

const Config = await createTestAppConfig();
const SSR_PRELOAD_HOST_TAG = 'ecopages-jsx-ssr-preload-host';

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
	it.runIf(typeof Bun !== 'undefined')(
		'registers Radiant hosts from dependencies.scripts ssr true without a static import',
		async () => {
			installLightDomShim();
			const tempDir = await mkdtemp(path.join(tmpdir(), 'ecopages-jsx-ssr-preload-host-'));
			const hostFile = path.join(tempDir, 'host.tsx');
			const scriptFile = path.join(tempDir, 'ssr-preload-host.script.mjs');

			try {
				await writeFile(
					scriptFile,
					[
						`class SsrPreloadHost extends HTMLElement {`,
						'\trenderHostToString() {',
						`\t\treturn '<${SSR_PRELOAD_HOST_TAG}><span data-ssr-preload-host-marker="true">registered</span></${SSR_PRELOAD_HOST_TAG}>';`,
						'\t}',
						'}',
						`customElements.define('${SSR_PRELOAD_HOST_TAG}', SsrPreloadHost);`,
					].join('\n'),
				);

				const Host = eco.component<{}, JsxRenderable>({
					integration: 'ecopages-jsx',
					identity: { id: 'ssr-preload-host', file: hostFile, integration: 'ecopages-jsx' },
					dependencies: {
						scripts: [{ src: './ssr-preload-host.script.mjs', ssr: true }],
					},
					render: () => <ecopages-jsx-ssr-preload-host />,
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

				expect(result.html).toContain('data-ssr-preload-host-marker="true"');
			} finally {
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
