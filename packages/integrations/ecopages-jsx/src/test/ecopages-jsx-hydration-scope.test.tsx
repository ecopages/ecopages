/** @jsxImportSource @ecopages/jsx */
import { describe, expect, it, vi } from 'vitest';
import { ConfigBuilder } from '@ecopages/core/config-builder';
import { eco, type EcoComponent, type HtmlTemplateProps } from '@ecopages/core';
import type { JsxCustomElementAttributes, JsxRenderable } from '@ecopages/jsx';
import { renderToString } from '@ecopages/jsx/server';
import { EcopagesJsxRenderer } from '../ecopages-jsx-renderer.ts';
import { EcopagesJsxRadiantSsrPolicy } from '../ecopages-jsx-radiant-ssr-policy.ts';

type IntrinsicContractElement = HTMLElement & { count?: number };

declare module '@ecopages/jsx' {
	interface JsxCustomIntrinsicElements {
		'ecopages-jsx-hydration-scope-probe': JsxCustomElementAttributes<IntrinsicContractElement, { count?: number }>;
	}
}

const TestConfig = await new ConfigBuilder()
	.setRobotsTxt({
		preferences: {
			'*': [],
		},
	})
	.setIntegrations([])
	.setDefaultMetadata({
		title: 'Ecopages',
		description: 'Ecopages',
	})
	.setBaseUrl('http://localhost:3000')
	.build();

class TestEcopagesJsxRenderer extends EcopagesJsxRenderer {
	protected override async getHtmlTemplate(): Promise<EcoComponent<HtmlTemplateProps>> {
		return RouteHtmlTemplate as unknown as EcoComponent<HtmlTemplateProps>;
	}

	protected override async resolveDependencies(): Promise<[]> {
		return [];
	}
}

const RouteHtmlTemplate = ({ children }: { children: JsxRenderable }) => {
	return (
		<html>
			<head>
				<meta name="description" content="hydration scope regression" />
				<link rel="canonical" href="https://example.test/docs" />
			</head>
			<body>
				<main data-document-root on:click={() => undefined}>
					{children}
				</main>
			</body>
		</html>
	);
};

describe('EcopagesJsxRenderer hydration scope', () => {
	it('renders the page shell in plain mode while intrinsic Radiant hosts keep local hydrate markers', async () => {
		const hydrationScopeTestTag = 'ecopages-jsx-hydration-scope-probe';
		const customElementRegistry =
			(
				globalThis as typeof globalThis & {
					customElements?: {
						define: (name: string, constructor: CustomElementConstructor) => void;
						get: (name: string) => CustomElementConstructor | undefined;
					};
				}
			).customElements ??
			(() => {
				const registry = new Map<string, CustomElementConstructor>();

				const shim = {
					define(name: string, constructor: CustomElementConstructor) {
						registry.set(name, constructor);
					},
					get(name: string) {
						return registry.get(name);
					},
				};

				Object.defineProperty(globalThis, 'customElements', {
					configurable: true,
					value: shim,
				});

				return shim;
			})();
		const TestElementBase =
			typeof HTMLElement === 'undefined'
				? class {
						private readonly attributes = new Map<string, string>();

						setAttribute(name: string, value: string): void {
							this.attributes.set(name, value);
						}
					}
				: HTMLElement;
		const runtimeModules = {
			installLightDomShim: () => undefined,
			resolveRadiantElementRenderBridge: (instance: unknown) => {
				if (
					typeof instance === 'object' &&
					instance !== null &&
					'renderHostToString' in instance &&
					typeof (instance as { renderHostToString?: unknown }).renderHostToString === 'function'
				) {
					return {
						renderHost: () => ({
							nodeType: 1 as const,
							outerHTML: (
								instance as { renderHostToString: (options?: unknown) => string }
							).renderHostToString({
								mode: 'hydrate',
							}),
						}),
						renderHostToString: (options?: unknown) =>
							(instance as { renderHostToString: (options?: unknown) => string }).renderHostToString(
								options,
							),
					};
				}

				return undefined;
			},
			withServerRadiantElementSsrRuntime: <T,>(render: () => T) => render(),
		};

		(
			EcopagesJsxRadiantSsrPolicy as unknown as {
				runtimeModules?: typeof runtimeModules;
				runtimeModulesPromise?: Promise<typeof runtimeModules>;
			}
		).runtimeModules = runtimeModules;
		(
			EcopagesJsxRadiantSsrPolicy as unknown as {
				runtimeModules?: typeof runtimeModules;
				runtimeModulesPromise?: Promise<typeof runtimeModules>;
			}
		).runtimeModulesPromise = Promise.resolve(runtimeModules);

		if (!customElementRegistry.get(hydrationScopeTestTag)) {
			class HydrationScopeProbeElement extends TestElementBase {
				declare count?: number;

				setAttribute(name: string, value: string): void {
					super.setAttribute(name, value);
					if (name === 'count') {
						this.count = Number(value);
					}
				}

				renderHostToString(options: { hydrate?: boolean; mode?: 'hydrate' | 'plain' }) {
					const mode = options.mode ?? (options.hydrate ? 'hydrate' : 'plain');
					const hostView = renderToString(
						<button on:click={() => undefined} data-host-count={String(this.count ?? 0)}>
							Host
						</button>,
						{ mode },
					);

					return `<${hydrationScopeTestTag}>${hostView}</${hydrationScopeTestTag}>`;
				}
			}

			customElementRegistry.define(
				hydrationScopeTestTag,
				HydrationScopeProbeElement as unknown as CustomElementConstructor,
			);
		}

		const renderer = new TestEcopagesJsxRenderer({
			appConfig: TestConfig,
			assetProcessingService: {
				processDependencies: vi.fn(async () => []),
			} as never,
			runtimeOrigin: 'http://localhost:3000',
			resolvedIntegrationDependencies: [],
			jsxConfig: {
				radiantSsrEnabled: true,
			},
		});

		const Layout = eco.layout<JsxRenderable>({
			integration: 'ecopages-jsx',
			render: ({ children }) => (
				<section data-layout-root on:click={() => undefined}>
					<a href="/docs/getting-started/introduction">Docs</a>
					{children}
					<ecopages-jsx-hydration-scope-probe count={2} />
				</section>
			),
		});

		const Page = eco.page<{ label: string }, JsxRenderable>({
			integration: 'ecopages-jsx',
			layout: Layout,
			render: ({ label }) => (
				<article data-view-root on:click={() => undefined}>
					{label}
				</article>
			),
		});

		const body = await renderer.render({
			params: {},
			query: {},
			props: { label: 'Route page' },
			file: '/app/pages/index.tsx',
			resolvedDependencies: [],
			metadata: {
				title: 'Route page',
				description: 'Route page',
			},
			Page: Page as EcoComponent<Record<string, unknown>, JsxRenderable>,
			Layout: Layout as unknown as EcoComponent<Record<string, unknown>, JsxRenderable>,
			HtmlTemplate: RouteHtmlTemplate as unknown as EcoComponent<HtmlTemplateProps>,
			pageProps: { label: 'Route page' },
		});

		const html = await new Response(body as BodyInit).text();
		const customElementMatch = html.match(
			new RegExp(`<${hydrationScopeTestTag}[^>]*>([\\s\\S]*?)<\\/${hydrationScopeTestTag}>`),
		);

		expect(customElementMatch?.[1]).toBeDefined();

		const customElementIndexes = Array.from(
			customElementMatch![1].matchAll(/data-radiant-jsx-bind-(\d+)/g),
			(match) => Number(match[1]),
		);
		const pageHtml = html.replace(customElementMatch![0], '');
		const pageLevelIndexes = Array.from(pageHtml.matchAll(/data-radiant-jsx-bind-(\d+)/g), (match) =>
			Number(match[1]),
		);
		const uniqueCustomElementIndexes = Array.from(new Set(customElementIndexes)).sort(
			(left, right) => left - right,
		);
		const uniquePageLevelIndexes = Array.from(new Set(pageLevelIndexes)).sort((left, right) => left - right);

		expect(html).toContain('<html>');
		expect(html).toContain('<head>');
		expect(html).toContain('<body>');
		expect(html).not.toMatch(/<html[^>]*data-radiant-jsx-bind-/);
		expect(html).not.toMatch(/<head[^>]*data-radiant-jsx-bind-/);
		expect(html).not.toMatch(/<body[^>]*data-radiant-jsx-bind-/);
		expect(html).not.toMatch(/<meta[^>]*data-radiant-jsx-bind-/);
		expect(html).not.toMatch(/<link[^>]*data-radiant-jsx-bind-/);
		expect(html).not.toMatch(/<main[^>]*data-radiant-jsx-bind-/);
		expect(html).not.toMatch(/<section[^>]*data-radiant-jsx-bind-/);
		expect(html).not.toMatch(/<article[^>]*data-radiant-jsx-bind-/);
		expect(html).not.toMatch(/<a[^>]*data-radiant-jsx-bind-/);
		expect(uniquePageLevelIndexes).toEqual([]);
		expect(uniqueCustomElementIndexes.length).toBeGreaterThan(1);
		expect(uniqueCustomElementIndexes).toEqual(
			Array.from({ length: uniqueCustomElementIndexes.length }, (_value, index) => index),
		);
	});
});
