import { readFileSync } from 'node:fs';
import path from 'node:path';

export type TemplateManifestEntry = {
	id: string;
	displayName: string;
	description: string;
	category: string;
	order: number;
	default?: boolean;
	source: string;
	packageDirectory: string;
	integrations: string[];
	buildOutputs?: unknown;
};

export type TemplateManifest = { templates: TemplateManifestEntry[] };

export const templateManifestPath = path.resolve(import.meta.dirname, '../packages/ecopages/templates.json');

export function readTemplateManifest(): TemplateManifest {
	return JSON.parse(readFileSync(templateManifestPath, 'utf8')) as TemplateManifest;
}

/** The manifest entry for `id`; an id the manifest does not list is an error. */
export function findTemplate(manifest: TemplateManifest, id: string): TemplateManifestEntry {
	const template = manifest.templates.find((entry) => entry.id === id);
	if (!template) throw new Error(`Unknown template "${id}".`);
	return template;
}

/** What a template build must emit when its manifest entry declares nothing else. */
export const DEFAULT_BUILD_OUTPUTS = ['dist/client/index.html'];

function isDistPath(output: unknown): output is string {
	return typeof output === 'string' && path.posix.normalize(output).startsWith('dist/');
}

/**
 * The files a template's build must emit, relative to its package folder.
 *
 * @remarks
 * A template entry in `packages/ecopages/templates.json` lists them as `buildOutputs`, for example a nested page
 * or a prebuilt product page, so the smoke checks catch a `paths` regression that the default `index.html`
 * check misses. The list replaces the default. It lives in the manifest rather than the template's
 * `package.json` so that projects created with `ecopages init` do not inherit it. Each path must stay under
 * `dist/` once normalized, so `dist/../src` is refused.
 */
export function templateBuildOutputs(template: Pick<TemplateManifestEntry, 'id' | 'buildOutputs'>): string[] {
	const outputs = template.buildOutputs;
	if (outputs === undefined) return DEFAULT_BUILD_OUTPUTS;
	if (!Array.isArray(outputs) || outputs.length === 0 || !outputs.every(isDistPath)) {
		throw new Error(`Template ${template.id}: buildOutputs must be a non-empty list of paths under dist/.`);
	}
	return outputs;
}
