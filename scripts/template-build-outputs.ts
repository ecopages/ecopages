/** What a template build must emit when its manifest entry declares nothing else. */
export const DEFAULT_BUILD_OUTPUTS = ['dist/client/index.html'];

/**
 * The files a template's build must emit, relative to its package folder.
 *
 * @remarks
 * A template entry in `packages/ecopages/templates.json` lists them as `buildOutputs`, for example a nested page
 * or a prebuilt product page, so the smoke checks catch a `paths` regression that the default `index.html`
 * check misses. The list replaces the default. It lives in the manifest rather than the template's
 * `package.json` so that projects created with `ecopages init` do not inherit it.
 */
export function templateBuildOutputs(template: { id: string; buildOutputs?: unknown }): string[] {
	const outputs = template.buildOutputs;
	if (outputs === undefined) return DEFAULT_BUILD_OUTPUTS;
	if (
		!Array.isArray(outputs) ||
		outputs.length === 0 ||
		!outputs.every((output) => typeof output === 'string' && output.startsWith('dist/'))
	) {
		throw new Error(`Template ${template.id}: buildOutputs must be a non-empty list of paths under dist/.`);
	}
	return outputs;
}
