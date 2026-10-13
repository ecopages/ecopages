import type { EcoBuildOnTransformResult, EcoBuildPlugin } from '../../build/contracts/build-types.ts';

/** The `transform` hook one build plugin registers, read back from its `setup`. */
export type RegisteredTransform = {
	filter: RegExp;
	transform(code: string, id: string): EcoBuildOnTransformResult | string | undefined;
};

/** Runs a plugin's `setup` against a recording builder and returns the one `transform` it registered. */
export function getPluginTransform(plugin: EcoBuildPlugin): RegisteredTransform {
	let registered: RegisteredTransform | undefined;
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
	});
	if (!registered) {
		throw new Error(`Plugin "${plugin.name}" registered no transform.`);
	}
	return registered;
}
