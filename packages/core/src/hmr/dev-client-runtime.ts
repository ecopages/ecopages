import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import type { BrowserBundleService } from '../services/assets/browser-bundle.service.ts';
import { removeStaleHmrEntrypointOutput } from './hmr-entrypoint-output.ts';

/**
 * One browser script the dev server bundles once, serves at a fixed URL and loads from every HTML page.
 *
 * @remarks
 * The HMR client and the Dev Toolbar client are both runtimes. Each keeps its own `onFailure` policy, so a
 * toolbar that cannot be bundled is logged without taking the HMR client down with it.
 */
export type DevClientRuntime = {
	/** Name used in log lines and in the module a failed bundle reports. */
	name: string;
	/** URL the bundle is served at, and the module specifier injected into HTML. */
	url: string;
	/** Directory the bundle is emitted into. */
	workDir: string;
	/** Returns the browser entry to bundle, and throws when it cannot be resolved. */
	resolveEntry: () => string;
	/** Reports a bundle failure of this runtime. */
	onFailure: (error: unknown) => void;
};

/** Absolute path of the bundle a runtime emits. */
export function getDevClientRuntimePath(runtime: DevClientRuntime): string {
	return path.join(runtime.workDir, path.basename(runtime.url));
}

/**
 * Bundles a runtime into its work directory and reports whether the bundle exists.
 *
 * @remarks
 * Resolution, bundling and a missing output all end in `runtime.onFailure` and `false`; nothing throws.
 */
export async function bundleDevClientRuntime(
	runtime: DevClientRuntime,
	browserBundleService: Pick<BrowserBundleService, 'bundle'>,
): Promise<boolean> {
	const runtimePath = getDevClientRuntimePath(runtime);

	try {
		removeStaleHmrEntrypointOutput(runtimePath, runtime.name);

		const result = await browserBundleService.bundle({
			profile: 'hmr-runtime',
			entrypoints: [runtime.resolveEntry()],
			outdir: runtime.workDir,
			naming: path.basename(runtime.url),
			minify: false,
		});

		if (!result.success) {
			runtime.onFailure(result.logs);
			return false;
		}

		const emittedRuntime = result.outputs.find((output) => path.resolve(output.path) === path.resolve(runtimePath));
		if (!emittedRuntime || !fileSystem.exists(runtimePath)) {
			runtime.onFailure(new Error(`[${runtime.name}] Runtime bundle missing expected output at ${runtimePath}`));
			return false;
		}

		return true;
	} catch (error) {
		runtime.onFailure(error);
		return false;
	}
}

/** Serves the bundle of a runtime, or returns `null` when it was not emitted. */
export function readDevClientRuntime(runtime: DevClientRuntime): Response | null {
	const runtimePath = getDevClientRuntimePath(runtime);
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

/**
 * Loads each runtime from an HTML response with a module script before `</html>`.
 *
 * @remarks
 * A runtime already imported by the document is skipped, because a response can pass through more than one
 * development layer before it reaches the client.
 */
export async function injectDevClientRuntimes(
	response: Response,
	runtimes: readonly DevClientRuntime[],
): Promise<Response> {
	if (runtimes.length === 0) {
		return response;
	}

	const html = await response.text();
	const headers = new Headers(response.headers);
	headers.delete('Content-Length');

	const scripts = runtimes
		.map((runtime) => `import '${runtime.url}'`)
		.filter((specifier) => !html.includes(specifier))
		.map((specifier) => `<script type="module">${specifier};</script>`)
		.join('');

	return new Response(scripts ? html.replace(/<\/html>/i, `${scripts}</html>`) : html, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}
