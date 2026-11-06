import type { EcoBuildOnTransformResult, EcoBuildPlugin } from '../../build/contracts/build-types.ts';

/** The `transform` hook one build plugin registers, read back from its `setup`. */
export type RegisteredTransform = {
	filter: RegExp;
	transform(code: string, id: string): EcoBuildOnTransformResult | string | undefined;
	/** Runs the `onEnd` checks the plugin registered, as the end of a build does. */
	end(): Promise<void>;
};

/** Runs a plugin's `setup` against a recording builder and returns the one `transform` it registered. */
export function getPluginTransform(plugin: EcoBuildPlugin): RegisteredTransform {
	let registered: Omit<RegisteredTransform, 'end'> | undefined;
	const endCallbacks: Array<() => void | Promise<void>> = [];
	void plugin.setup({
		onResolve() {},
		onLoad() {},
		module() {},
		transform(options, callback) {
			registered = {
				filter: options.filter,
				transform: (code, id) => callback(code, id) as EcoBuildOnTransformResult | string | undefined,
			};
		},
		onEnd(callback) {
			endCallbacks.push(callback);
		},
		addWatchFile() {},
		resolve: async () => undefined,
	});
	if (!registered) {
		throw new Error(`Plugin "${plugin.name}" registered no transform.`);
	}
	return {
		...registered,
		end: async () => {
			for (const callback of endCallbacks) await callback();
		},
	};
}
