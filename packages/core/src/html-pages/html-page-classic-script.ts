import { fileSystem } from '@ecopages/file-system';
import { parseModuleSource } from '../cache/module-parse-cache.ts';
import type { ScriptAsset } from '../services/assets/asset-processing-service/assets.types.ts';

const TYPESCRIPT_FILE = /\.[cm]?tsx?$/;

/**
 * Picks how a local `<script src>` without `type="module"` is emitted.
 *
 * @remarks
 * Classic scripts keep classic semantics, as Parcel does: the browser runs them where they
 * are written, and their top-level functions and variables are globals other scripts use.
 * A JavaScript file is copied as written. A TypeScript file has only its types stripped:
 * nothing is tree-shaken or minified, so its globals survive, and it stays out of the HMR
 * pipeline, which would turn it into an ES module.
 *
 * @throws When the file uses `import`, `export`, or `import.meta`, which a classic script
 * cannot; the message names the HTML file and asks for `type="module"`.
 */
export function resolveClassicScriptOptions(
	file: string,
	reference: string,
	filepath: string,
): Pick<ScriptAsset, 'bundle' | 'bundleOptions' | 'skipHmr'> {
	const source = fileSystem.readFileSync(filepath).toString();
	if (parseModuleSource(filepath, source).module.hasModuleSyntax) {
		throw new Error(
			`[ecopages] ${file}: "${reference}" uses import, export, or import.meta, which a classic script cannot. Add type="module" to its <script> tag.`,
		);
	}

	return TYPESCRIPT_FILE.test(filepath)
		? { skipHmr: true, bundleOptions: { splitting: false, treeshaking: false, minify: false } }
		: { bundle: false };
}
