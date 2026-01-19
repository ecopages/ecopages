import { describe, it, expect, mock } from 'bun:test';
import { IntegrationRenderer } from './integration-renderer.ts';
import type { EcoPagesAppConfig } from '../internal-types.ts';
import type { AssetProcessingService, ProcessedAsset } from '../services/asset-processing-service/index.ts';
import type {
	RouteRendererBody,
	EcoPagesElement,
	IntegrationRendererRenderOptions,
	EcoPageFile,
	RouteRendererOptions,
	EcoComponent,
	HtmlTemplateProps,
} from '../public-types.ts';
import type { EcoPageComponent } from '../eco/eco.types.ts';

/**
 * Concrete implementation with mocked file loading for testing purposes.
 */
class TestIntegrationRenderer extends IntegrationRenderer<EcoPagesElement> {
	name = 'test-renderer';

	/** Mock data container for page module */
	mockPageModule: EcoPageFile | null = null;
	/** Mock HTML template container */
	mockHtmlTemplate: EcoComponent<HtmlTemplateProps> | null = null;

	async render(_options: IntegrationRendererRenderOptions<EcoPagesElement>): Promise<RouteRendererBody> {
		return '<html><body>Test Page</body></html>';
	}

	/**
	 * Override protected methods to return mock data.
	 */
	protected override async importPageFile(_file: string): Promise<EcoPageFile> {
		if (!this.mockPageModule) throw new Error('Mock page module not set');
		return this.mockPageModule;
	}

	protected override async getHtmlTemplate(): Promise<EcoComponent<HtmlTemplateProps>> {
		if (!this.mockHtmlTemplate) throw new Error('Mock HTML template not set');
		return this.mockHtmlTemplate;
	}

	/**
	 * Override to avoid asset processing service dependency in tests.
	 */
	protected override async resolveDependencies(
		_components: (EcoComponent | Partial<EcoComponent>)[],
	): Promise<ProcessedAsset[]> {
		return [];
	}

	protected override async buildRouteRenderAssets(_file: string): Promise<ProcessedAsset[]> {
		return [];
	}

	/**
	 * Expose protected method for testing.
	 */
	public async testPrepareRenderOptions(options: RouteRendererOptions) {
		return this.prepareRenderOptions(options);
	}
}

describe('IntegrationRenderer', () => {
	const mockAppConfig = {
		absolutePaths: {
			pagesDir: '/app/pages',
			htmlTemplatePath: '/app/index.ghtml.ts',
		},
		defaultMetadata: {
			title: 'Default Title',
			description: 'Default Description',
		},
		srcDir: '/app',
	} as unknown as EcoPagesAppConfig;

	const mockAssetService = {
		processDependencies: mock(() => Promise.resolve([])),
	} as unknown as AssetProcessingService;

	it('should extract cache strategy from page component (static property)', async () => {
		const renderer = new TestIntegrationRenderer({
			appConfig: mockAppConfig,
			assetProcessingService: mockAssetService,
			runtimeOrigin: 'http://localhost:3000',
		});

		/** Mock page with cache strategy */
		const mockPageIdx = (() => 'Page Content') as EcoPageComponent<any>;
		/** Simulate eco.page() attaching cache config */
		mockPageIdx.cache = { revalidate: 60 };

		renderer.mockPageModule = {
			default: mockPageIdx,
		};
		renderer.mockHtmlTemplate = (() => 'HTML Template') as EcoComponent<HtmlTemplateProps>;

		const options: RouteRendererOptions = {
			file: '/app/pages/cached-page.ts',
			params: {},
			query: {},
		};

		const result = await renderer.testPrepareRenderOptions(options);

		expect(result.cacheStrategy).toEqual({ revalidate: 60 });
	});

	it('should return undefined cache strategy if not present', async () => {
		const renderer = new TestIntegrationRenderer({
			appConfig: mockAppConfig,
			assetProcessingService: mockAssetService,
			runtimeOrigin: 'http://localhost:3000',
		});

		/** Mock page without cache strategy */
		const mockPageIdx = (() => 'Page Content') as EcoPageComponent<any>;

		renderer.mockPageModule = {
			default: mockPageIdx,
		};
		renderer.mockHtmlTemplate = (() => 'HTML Template') as EcoComponent<HtmlTemplateProps>;

		const options: RouteRendererOptions = {
			file: '/app/pages/simple-page.ts',
			params: {},
			query: {},
		};

		const result = await renderer.testPrepareRenderOptions(options);

		expect(result.cacheStrategy).toBeUndefined();
	});

	it('should resolve static props and metadata correctly', async () => {
		const renderer = new TestIntegrationRenderer({
			appConfig: mockAppConfig,
			assetProcessingService: mockAssetService,
			runtimeOrigin: 'http://localhost:3000',
		});

		const mockPageIdx = (() => 'Page Content') as EcoPageComponent<any>;
		/** Attached static methods */
		mockPageIdx.staticProps = async () => ({ props: { title: 'Dynamic Title' } });
		mockPageIdx.metadata = async ({ props }: { props: Record<string, unknown> }) => ({
			title: props.title as string,
			description: 'Dynamic Description',
		});

		renderer.mockPageModule = {
			default: mockPageIdx,
		};
		renderer.mockHtmlTemplate = (() => 'HTML Template') as EcoComponent<HtmlTemplateProps>;

		const options: RouteRendererOptions = {
			file: '/app/pages/props-page.ts',
			params: {},
			query: {},
		};

		const result = await renderer.testPrepareRenderOptions(options);

		expect(result.props).toEqual({ title: 'Dynamic Title' });
		expect(result.metadata?.title).toBe('Dynamic Title');
	});
});
