import type { HtmlDocumentContribution } from '../services/html/html-transformer.service.ts';
import type { EcoPagesAppConfig } from '../types/internal-types.ts';
import type { PagePackageResult } from '../types/public-types.ts';
import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import { removeStaleHmrEntrypointOutput } from '../hmr/hmr-entrypoint-output.ts';
import { isDevToolbarEnabled } from './dev-toolbar-config.ts';
import { resolveConfiguredDevToolbarClient } from './dev-toolbar-package.ts';
import { buildDevToolbarManifestPayload, serializeDevToolbarManifestScript } from './dev-toolbar-manifest.ts';
import {
	DEV_TOOLBAR_RUNTIME_IMPORT,
	DEV_TOOLBAR_RUNTIME_SCRIPT_URL,
	resolveDevToolbarRuntimeWorkDir,
} from './dev-toolbar-runtime-paths.ts';

export type DevToolbarHostOptions = {
	watch: boolean;
	hostOwnsDevClient?: boolean;
};

type DevToolbarBundleService = {
	bundle: (options: {
		profile: 'hmr-runtime';
		entrypoints: string[];
		outdir: string;
		naming: string;
		minify: boolean;
	}) => Promise<{
		success: boolean;
		logs: unknown;
		outputs: Array<{ path: string }>;
	}>;
};

/**
 * Server-side entry point for dev toolbar config, HTML injection, manifest, and runtime bundling.
 */
export class DevToolbarHost {
	private readonly appConfig: EcoPagesAppConfig;
	private readonly options: DevToolbarHostOptions;

	constructor(appConfig: EcoPagesAppConfig, options: DevToolbarHostOptions) {
		this.appConfig = appConfig;
		this.options = options;
	}

	static forApp(appConfig: EcoPagesAppConfig, options: DevToolbarHostOptions): DevToolbarHost {
		return new DevToolbarHost(appConfig, options);
	}

	isEnabled(): boolean {
		return isDevToolbarEnabled(this.appConfig, this.options);
	}

	getRuntimeScriptUrl(): string {
		return DEV_TOOLBAR_RUNTIME_SCRIPT_URL;
	}

	getRuntimeScriptImport(): string {
		return DEV_TOOLBAR_RUNTIME_IMPORT;
	}

	resolveRuntimeWorkDir(workDir: string): string {
		return resolveDevToolbarRuntimeWorkDir(workDir);
	}

	shouldInjectHtml(): boolean {
		return this.isEnabled();
	}

	async injectHtmlResponse(response: Response): Promise<Response> {
		const html = await response.text();
		const headers = new Headers(response.headers);
		headers.set('Cache-Control', 'no-store, must-revalidate');
		headers.delete('Content-Length');

		if (html.includes(this.getRuntimeScriptImport())) {
			return new Response(html, {
				status: response.status,
				statusText: response.statusText,
				headers,
			});
		}

		const script = `<script type="module">${this.getRuntimeScriptImport()};</script>`;
		const updatedHtml = html.replace(/<\/html>/i, `${script}</html>`);

		return new Response(updatedHtml, {
			status: response.status,
			statusText: response.statusText,
			headers,
		});
	}

	buildRouteManifestContribution(input: {
		routeFile: string;
		integrationName: string;
		pagePackage?: PagePackageResult;
	}): HtmlDocumentContribution | undefined {
		if (!this.isEnabled()) {
			return undefined;
		}

		const payload = buildDevToolbarManifestPayload({
			routeFile: input.routeFile,
			integrationName: input.integrationName,
			pagePackage: input.pagePackage,
		});

		return {
			placement: 'body-append',
			html: serializeDevToolbarManifestScript(payload),
		};
	}

	async bundleClientRuntime(options: {
		browserBundleService: DevToolbarBundleService;
		workDir: string;
		onFailure: (error: unknown) => void;
	}): Promise<boolean> {
		if (!this.isEnabled()) {
			return true;
		}

		const client = resolveConfiguredDevToolbarClient(this.appConfig);
		if (!client) {
			options.onFailure(
				new Error('[DevToolbar] No client package configured. Set devToolbar.package in your app config.'),
			);
			return false;
		}

		const runtimePath = path.join(options.workDir, path.basename(DEV_TOOLBAR_RUNTIME_SCRIPT_URL));

		removeStaleHmrEntrypointOutput(runtimePath, 'DevToolbar');

		try {
			const result = await options.browserBundleService.bundle({
				profile: 'hmr-runtime',
				entrypoints: [client.entryPath],
				outdir: options.workDir,
				naming: path.basename(DEV_TOOLBAR_RUNTIME_SCRIPT_URL),
				minify: false,
			});

			if (!result.success) {
				options.onFailure(result.logs);
				return false;
			}

			const emittedRuntime = result.outputs.find(
				(output) => path.resolve(output.path) === path.resolve(runtimePath),
			);

			if (!emittedRuntime || !fileSystem.exists(runtimePath)) {
				options.onFailure(new Error(`[DevToolbar] Runtime bundle missing expected output at ${runtimePath}`));
				return false;
			}

			return true;
		} catch (error) {
			options.onFailure(error);
			return false;
		}
	}

	readBundledRuntime(workDir: string): Response | null {
		const runtimePath = path.join(workDir, path.basename(DEV_TOOLBAR_RUNTIME_SCRIPT_URL));
		if (!fileSystem.exists(runtimePath)) {
			return null;
		}

		return new Response(fileSystem.readFileAsBuffer(runtimePath) as BodyInit, {
			headers: {
				'Content-Type': 'application/javascript',
				'Cache-Control': 'no-store, must-revalidate',
			},
		});
	}
}
