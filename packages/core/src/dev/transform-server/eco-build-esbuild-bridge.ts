import type { Plugin, Loader } from 'esbuild';
import type { EcoBuildPlugin, EcoBuildLoader } from '../../build/contracts/build-types.ts';

function mapLoader(loader?: EcoBuildLoader): Loader | undefined {
	if (!loader) return undefined;
	const allowed: Loader[] = ['js', 'jsx', 'ts', 'tsx', 'json', 'text', 'css'];
	return allowed.includes(loader as Loader) ? (loader as Loader) : 'js';
}

/**
 * Adapts Ecopages {@link EcoBuildPlugin} hooks into esbuild plugins for dev transform.
 */
export function createEsbuildPluginsFromEcoBuild(ecoPlugins: readonly EcoBuildPlugin[]): Plugin[] {
	return ecoPlugins.map((ecoPlugin) => {
		const resolveHooks: Array<{
			filter: RegExp;
			namespace?: string;
			callback: Parameters<EcoBuildPlugin['setup']>[0]['onResolve'] extends (...args: infer A) => void
				? A[1]
				: never;
		}> = [];
		const loadHooks: Array<{
			filter: RegExp;
			namespace?: string;
			callback: Parameters<EcoBuildPlugin['setup']>[0]['onLoad'] extends (...args: infer A) => void
				? A[1]
				: never;
		}> = [];

		ecoPlugin.setup({
			onResolve(options, callback) {
				resolveHooks.push({ filter: options.filter, namespace: options.namespace, callback });
			},
			onLoad(options, callback) {
				loadHooks.push({ filter: options.filter, namespace: options.namespace, callback });
			},
			module() {
				// virtual modules are not used by dev transform bridge today
			},
		});

		return {
			name: ecoPlugin.name,
			setup(build) {
				for (const hook of resolveHooks) {
					build.onResolve({ filter: hook.filter, namespace: hook.namespace }, async (args) => {
						const result = await hook.callback({
							path: args.path,
							importer: args.importer,
							namespace: args.namespace,
						});
						if (!result) {
							return undefined;
						}
						return {
							path: result.path ?? args.path,
							namespace: result.namespace,
							external: result.external,
						};
					});
				}

				for (const hook of loadHooks) {
					build.onLoad({ filter: hook.filter, namespace: hook.namespace }, async (args) => {
						const result = await hook.callback({ path: args.path, namespace: args.namespace });
						if (!result) {
							return undefined;
						}
						const contents = result.contents;
						return {
							contents:
								typeof contents === 'string' ? contents : contents ? Buffer.from(contents) : undefined,
							loader: mapLoader(result.loader),
						};
					});
				}
			},
		};
	});
}
