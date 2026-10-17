import { vi } from 'vitest';
import { createBrowserRuntimeManifest } from '../../build/browser/browser-runtime-manifest.ts';
import { createAppRuntime } from '../../config/app-runtime.ts';
import { IntegrationRenderer, type HtmlDocumentContribution } from './integration-renderer.ts';
import { getComponentRenderContext, type ForeignChildRuntime } from './foreign-child/component-render-context.ts';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import type { AssetProcessingService, ProcessedAsset } from '../../services/assets/asset-processing-service/index.ts';
import type {
	ComponentRenderInput,
	ComponentRenderResult,
	EcoPagesElement,
	IntegrationRendererRenderOptions,
	EcoPageFile,
	RouteRendererBody,
	EcoComponent,
	HtmlTemplateProps,
} from '../../types/public-types.ts';

export function createUnresolvedMarkerArtifact(nodeId: string, componentRef: string, propsRef: string): string {
	return `<eco-marker data-eco-node-id="${nodeId}" data-eco-component-ref="${componentRef}" data-eco-props-ref="${propsRef}"></eco-marker>`;
}

export function createMockIntegrationPlugin(
	plugin: { name: string } & Record<string, unknown>,
): EcoPagesAppConfig['integrations'][number] {
	return {
		getRenderer: vi.fn(),
		setup: vi.fn(async () => {}),
		hmr: vi.fn(),
		browserRuntimeManifest: createBrowserRuntimeManifest(),
		...plugin,
		plugins:
			typeof plugin.plugins === 'function'
				? plugin.plugins
				: () => (Array.isArray(plugin.plugins) ? plugin.plugins : []),
	} as unknown as EcoPagesAppConfig['integrations'][number];
}

export function createMockAppConfig(overrides: Partial<EcoPagesAppConfig> = {}): EcoPagesAppConfig {
	const config = {
		absolutePaths: {
			pagesDir: '/app/pages',
			htmlTemplatePath: '/app/index.ts',
		},
		loaders: new Map(),
		processors: new Map(),
		integrations: [],
		defaultMetadata: {
			title: 'Default Title',
			description: 'Default Description',
		},
		srcDir: '/app',
		...overrides,
	} as unknown as EcoPagesAppConfig;
	createAppRuntime(config);
	return config;
}

export const testAppConfig = createMockAppConfig();

export const testAssetService = {
	processDependencies: vi.fn(() => Promise.resolve([])),
} as unknown as AssetProcessingService;

/**
 * Concrete implementation with ed file loading for testing purposes.
 */
export class TestIntegrationRenderer extends IntegrationRenderer<EcoPagesElement> {
	name = 'test-renderer';
	ForeignChildRuntimeCreationCount = 0;

	PageModule: EcoPageFile | null = null;
	HtmlTemplate: EcoComponent<HtmlTemplateProps> | null = null;
	UseDocumentShellRender = false;
	CapturedRenderOptions: IntegrationRendererRenderOptions<EcoPagesElement> | null = null;
	RenderedBody: RouteRendererBody = '<html><body>Test Page</body></html>';
	RenderBodyFactory:
		| ((context: ReturnType<typeof getComponentRenderContext>) => RouteRendererBody | Promise<RouteRendererBody>)
		| null = null;
	MockComponentRenderResult: ComponentRenderResult | null = null;
	ImportedFiles: string[] = [];
	HtmlContributions: HtmlDocumentContribution[] = [];

	override async render(options: IntegrationRendererRenderOptions<EcoPagesElement>): Promise<RouteRendererBody> {
		this.CapturedRenderOptions = options;
		if (this.UseDocumentShellRender) {
			return super.render(options);
		}

		if (this.RenderBodyFactory) {
			return await this.RenderBodyFactory(getComponentRenderContext());
		}

		return this.RenderedBody;
	}

	override async renderComponent(_input: ComponentRenderInput): Promise<ComponentRenderResult> {
		if (this.MockComponentRenderResult) {
			return this.MockComponentRenderResult;
		}

		return super.renderComponent(_input);
	}

	protected override async importPageFile(_file: string): Promise<EcoPageFile> {
		this.ImportedFiles.push(_file);
		if (!this.PageModule) throw new Error('Mock page module not set');
		return this.PageModule;
	}

	protected override async getHtmlTemplate(): Promise<EcoComponent<HtmlTemplateProps>> {
		if (!this.HtmlTemplate) throw new Error('Mock HTML template not set');
		return this.HtmlTemplate;
	}

	protected override async resolveDependencies(
		_components: (EcoComponent | Partial<EcoComponent>)[],
	): Promise<ProcessedAsset[]> {
		return [];
	}

	protected override createForeignChildRuntime(options: {
		renderInput: ComponentRenderInput;
		rendererCache: Map<string, IntegrationRenderer<any>>;
	}): ForeignChildRuntime {
		this.ForeignChildRuntimeCreationCount += 1;

		return super.createForeignChildRuntime(options);
	}

	protected override getHtmlDocumentContributions(_options?: {
		partial?: boolean;
	}): HtmlDocumentContribution[] | undefined {
		return this.HtmlContributions;
	}
}
