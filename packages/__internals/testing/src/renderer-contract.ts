import { describe, expect, it, vi } from 'vitest';
import {
	eco,
	type ComponentRenderInput,
	type ComponentRenderResult,
	type EcoComponent,
	type ForeignSubtreeRenderPayload,
} from '@ecopages/core';
import type { IntegrationRenderer } from '@ecopages/core/route-renderer/orchestration/integration-renderer';
import { toForeignSubtreeRenderPayload } from '@ecopages/core/route-renderer/orchestration/foreign-child/foreign-subtree-execution.service';
import type { AssetProcessingService, ProcessedAsset } from '@ecopages/core/services/asset-processing-service';
import {
	createDeferredIntegrationPlugin,
	htmlDocumentHead,
	renderFilesystemPageAndExplicitView,
	type AnyIntegrationPlugin,
} from './index.ts';

type ComponentConfig = NonNullable<EcoComponent['config']>;

/**
 * What the contract asks an Integration to build for a Component.
 *
 * @remarks
 * The Component renders `<tag>{props.text}{children}{embedded Components}</tag>`
 * in the Integration's own syntax. `children` is rendered only when
 * `acceptsChildren` is set. `config` carries identity and declared scripts
 * only; the factory adds the Integration name and the `embed` dependencies.
 * `asLayout` declares it as a layout, which is what a view's `layout` takes.
 */
export type RendererContractComponentSpec = {
	tag: string;
	asLayout?: boolean;
	acceptsChildren?: boolean;
	config?: Pick<ComponentConfig, 'identity' | 'dependencies'>;
	embed?: EcoComponent[];
};

/**
 * What the contract asks an Integration to build for a view.
 *
 * @remarks
 * The view renders `<section>{text}</section>`. `layout` wraps it, `title` is
 * its page metadata title and `fail` makes it throw an Error with that message.
 */
export type RendererContractViewSpec = {
	text: string;
	layout?: EcoComponent;
	title?: string;
	fail?: string;
};

export type RendererContractRendererOptions = {
	integrations: AnyIntegrationPlugin[];
	processDependencies: AssetProcessingService['processDependencies'];
};

/**
 * Everything one Integration supplies to {@link describeRendererContract}.
 */
export type RendererContractHarness = {
	/** Integration name the renderer reports and stamps. */
	name: string;
	/** Message prefix the renderer puts on a failed render. */
	errorPrefix: string;
	/** File key for filesystem and explicit-view renders. @default '/app/views/contract.tsx' */
	viewFile?: string;
	/**
	 * Builds a renderer over an app config that owns `integrations`.
	 *
	 * @remarks
	 * Its document shell must print `metadata.title` in `<head>` and the page in `<body>`.
	 */
	createRenderer(
		options: RendererContractRendererOptions,
	): IntegrationRenderer<unknown> | Promise<IntegrationRenderer<unknown>>;
	makeComponent(spec: RendererContractComponentSpec): EcoComponent;
	makeView(spec: RendererContractViewSpec): EcoComponent;
	/**
	 * Renders an island Component the way the Integration receives it in a page.
	 *
	 * @remarks
	 * Defaults to `renderer.renderComponent`. An Integration that hands island
	 * assets over through the render context supplies the context here.
	 */
	renderIsland?(renderer: IntegrationRenderer<unknown>, input: ComponentRenderInput): Promise<ComponentRenderResult>;
};

const ISLAND_SCRIPT: ProcessedAsset = { kind: 'script', srcUrl: '/assets/contract-island.js', position: 'head' };

const DEFERRED_WIDGET_HTML = '<button data-testid="deferred-widget">Deferred widget</button>';

function createDeferredWidget(): EcoComponent {
	return eco.component<Record<string, unknown>, string>({
		identity: {
			id: 'deferred-widget',
			file: '/app/components/deferred-widget.deferred.tsx',
			integration: 'deferred',
		},
		integration: 'deferred',
		render: () => DEFERRED_WIDGET_HTML,
	}) as unknown as EcoComponent;
}

/**
 * Registers the behaviour every Integration renderer owes core.
 *
 * @remarks
 * Core owns the shared render pipeline (status, headers, partial views, island
 * host attributes) against a test renderer. These rows pin what each real
 * renderer must add on top of it: structured output and name, the foreign
 * subtree payload, island stamping and assets, foreign boundaries that bubble
 * their assets, a deferred layout that leaves no marker behind, explicit view
 * and filesystem page parity, and a failed render that keeps the Integration's
 * message prefix. Framework-specific cases stay in the Integration's own tests.
 */
export function describeRendererContract(harness: RendererContractHarness): void {
	const { name, errorPrefix, makeComponent, makeView } = harness;
	const viewFile = harness.viewFile ?? '/app/views/contract.tsx';
	const renderIsland = harness.renderIsland ?? ((renderer, input) => renderer.renderComponent(input));

	const createPlainRenderer = (processDependencies?: RendererContractRendererOptions['processDependencies']) =>
		harness.createRenderer({
			integrations: [],
			processDependencies: processDependencies ?? (vi.fn(async () => []) as never),
		});

	const createIslandRenderer = async () => ({
		renderer: await harness.createRenderer({
			integrations: [],
			processDependencies: vi.fn(async () => [ISLAND_SCRIPT]) as never,
		}),
	});

	const islandComponent = () =>
		makeComponent({
			tag: 'h2',
			config: {
				identity: {
					id: 'contract-island',
					file: '/project/src/components/contract-island.tsx',
					integration: name,
				},
				dependencies: { scripts: ['./contract-island.script.ts'] },
			},
		});

	describe(`${name} renderer contract`, () => {
		it('renders a component as structured output named after the Integration', async () => {
			const renderer = await createPlainRenderer();

			const result = await renderer.renderComponent({
				component: makeComponent({ tag: 'h2' }),
				props: { text: 'Hello contract' },
			});

			expect(result.integrationName).toBe(name);
			expect(result.canAttachAttributes).toBe(true);
			expect(result.rootTag).toBe('h2');
			expect(result.html).toContain('<h2>Hello contract</h2>');
		});

		it('exposes the foreign subtree payload for a plain component', async () => {
			const renderer = await createPlainRenderer();

			const payload = toForeignSubtreeRenderPayload(
				await renderer.renderComponentWithForeignChildren({
					component: makeComponent({ tag: 'section' }),
					props: { text: 'Foreign subtree' },
				}),
			);

			expect(payload).toMatchObject<Partial<ForeignSubtreeRenderPayload>>({
				assets: [],
				rootTag: 'section',
				rootAttributes: undefined,
				attachmentPolicy: { kind: 'first-element' },
				integrationName: name,
			});
			expect(payload.html).toContain('<section>Foreign subtree</section>');
		});

		it('returns the assets a component declares', async () => {
			const { renderer } = await createIslandRenderer();

			const result = await renderIsland(renderer, {
				component: islandComponent(),
				props: { text: 'Island' },
				integrationContext: { componentInstanceId: 'contract-island-1' },
			});

			expect(result.assets?.length).toBeGreaterThan(0);
			expect(result.assets?.every((asset) => asset.kind === 'script')).toBe(true);
		});

		it('stamps island host attributes when the instance has client scripts', async () => {
			const { renderer } = await createIslandRenderer();

			const result = await renderIsland(renderer, {
				component: islandComponent(),
				props: { text: 'Island' },
				integrationContext: { componentInstanceId: 'contract-island-1' },
			});

			expect(result.rootAttributes?.['data-eco-island']).toBe('');
			expect(result.rootAttributes?.['data-eco-island-integration']).toBe(name);
			expect(result.rootAttributes?.['data-eco-component-id']).toBe('contract-island-1');
		});

		it('resolves foreign boundaries and bubbles their assets without marking the shell as an island host', async () => {
			const renderDeferred = vi.fn(async (input: ComponentRenderInput): Promise<ComponentRenderResult> => ({
				html: DEFERRED_WIDGET_HTML,
				canAttachAttributes: true,
				rootTag: 'button',
				integrationName: 'deferred',
				rootAttributes: {
					'data-eco-component-id':
						(input.integrationContext as { componentInstanceId?: string } | undefined)
							?.componentInstanceId ?? 'missing',
				},
				assets: [{ kind: 'script', inline: true, content: 'console.log("deferred")', position: 'body' }],
			}));
			const renderer = await harness.createRenderer({
				integrations: [createDeferredIntegrationPlugin({ renderComponent: renderDeferred })],
				processDependencies: vi.fn(async () => []) as never,
			});

			const result = await renderer.renderComponentWithForeignChildren({
				component: makeComponent({ tag: 'main', embed: [createDeferredWidget()] }),
				props: { text: 'Host text' },
				integrationContext: { componentInstanceId: 'host' },
			});

			expect(result.html).toContain('Host text');
			expect(result.html).toContain(
				'<button data-testid="deferred-widget" data-eco-component-id="host_n_1">Deferred widget</button>',
			);
			expect(result.html).not.toContain('<eco-marker');
			expect(result.assets).toEqual([
				expect.objectContaining({ kind: 'script', inline: true, position: 'body' }),
			]);
			expect(result.rootAttributes?.['data-eco-island']).toBeUndefined();
			expect(renderDeferred).toHaveBeenCalledTimes(1);
		});

		it('renders a deferred foreign layout without markers and keeps the explicit view equal to the page', async () => {
			const renderer = await harness.createRenderer({
				integrations: [createDeferredIntegrationPlugin()],
				processDependencies: vi.fn(async () => []) as never,
			});
			const layout = makeComponent({
				tag: 'main',
				acceptsChildren: true,
				asLayout: true,
				embed: [createDeferredWidget()],
			});
			const view = makeView({ text: 'Route page', title: 'Contract title', layout });

			const { pageHtml, explicitHtml } = await renderFilesystemPageAndExplicitView(renderer, view, {}, viewFile);

			expect(explicitHtml).toContain('Route page');
			expect(explicitHtml).toContain(DEFERRED_WIDGET_HTML);
			expect(explicitHtml).not.toContain('<eco-marker');
			expect(htmlDocumentHead(explicitHtml)).toContain('Contract title');
			expect(htmlDocumentHead(explicitHtml)).toBe(htmlDocumentHead(pageHtml));
			expect(explicitHtml).toBe(pageHtml);
		});

		it('fails a view that throws with the Integration error prefix and the cause', async () => {
			const renderer = await createPlainRenderer();
			const view = makeView({ text: 'Never rendered', fail: 'Contract view failed' });

			const error = await renderer.renderExplicitView(view, {}, {}).then(
				() => undefined,
				(rejection: unknown) => rejection,
			);

			expect(error).toBeInstanceOf(Error);
			expect((error as Error).message).toContain(errorPrefix);
			expect((error as Error).message).toContain('Contract view failed');
		});
	});
}

/**
 * Component and view factories for Integrations whose Components return HTML strings.
 *
 * @remarks
 * Shared by the Integrations that render Components as trusted markup strings
 * (kitajs, mdx and lit). Integrations with their own syntax write their own.
 */
export function createStringMarkupContractFactories(
	name: string,
): Pick<RendererContractHarness, 'makeComponent' | 'makeView'> {
	return {
		makeComponent({ tag, acceptsChildren, asLayout, config, embed }) {
			const declare = asLayout ? eco.layout : eco.component;
			return declare<Record<string, unknown>, string>({
				integration: name,
				identity:
					config?.identity ??
					(asLayout
						? { id: 'contract-layout', file: '/app/layouts/contract.tsx', integration: name }
						: undefined),
				dependencies: { ...config?.dependencies, ...(embed ? { components: embed } : {}) },
				render: (props) =>
					`<${tag}>${props.text ?? ''}${acceptsChildren ? String(props.children ?? '') : ''}${(embed ?? [])
						.map((component) => String((component as unknown as (props: object) => unknown)({})))
						.join('')}</${tag}>`,
			}) as unknown as EcoComponent;
		},
		makeView({ text, layout, title, fail }) {
			return eco.page<Record<string, unknown>, string>({
				integration: name,
				layout: layout as never,
				metadata: () => ({ title: title ?? 'Contract', description: title ?? 'Contract' }),
				render: () => {
					if (fail) {
						throw new Error(fail);
					}
					return `<section>${text}</section>`;
				},
			}) as unknown as EcoComponent;
		},
	};
}
