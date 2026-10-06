import { fileSystem } from '@ecopages/file-system';
import type { ScriptAsset } from '../services/assets/asset-processing-service/assets.types.ts';
import { compileClassicScript } from '../services/assets/asset-processing-service/processors/script/classic-script-compiler.ts';

/**
 * Picks how a local `<script src>` without `type="module"` is emitted, and rejects a file that
 * cannot be one.
 *
 * @remarks
 * Classic scripts keep classic semantics, as Parcel does: the browser runs them where they
 * are written, and their top-level functions and variables are globals other scripts use.
 * Each file is compiled on its own as a script (see `compileClassicScript`). Compiling here as
 * well as in the asset pipeline lets the error name the HTML file.
 *
 * @throws When the file cannot be a classic script. The message names the HTML file, and asks
 * for `type="module"` when that would make it work.
 */
export function resolveClassicScriptOptions(
	file: string,
	reference: string,
	filepath: string,
): Pick<ScriptAsset, 'classic'> {
	const compiled = compileClassicScript(filepath, fileSystem.readFileSync(filepath).toString(), { minify: false });
	if ('problem' in compiled) {
		const { reason, needsModule } = compiled.problem;
		throw new Error(
			needsModule
				? `[ecopages] ${file}: "${reference}" ${reason}, which a classic script cannot. Add type="module" to its <script> tag.`
				: `[ecopages] ${file}: "${reference}" ${reason}`,
		);
	}

	return { classic: true };
}
