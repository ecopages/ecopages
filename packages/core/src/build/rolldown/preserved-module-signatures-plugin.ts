import type { RolldownPlugin } from 'rolldown';
import { fromRolldownModuleId } from './rolldown-module-id.ts';

const COMMONJS_EXECUTION = /^export default require_[^\s(]+\(\);\n/mu;

/**
 * Keeps every export of every module, whatever imports it, when each module is emitted as its own file.
 *
 * @param entryPaths - The modules the build was asked for. A CommonJS module that is none of them is not run when
 * its file loads.
 *
 * @remarks
 * With `preserveModules`, Rolldown writes a module that is not an entry with the exports and statements that
 * the other modules of the build use, so the file of a module changes when a later entry uses more of it, and the
 * dev server's vendor files would change for pages that already loaded them. Emitting each module as a chunk of
 * its own with a strict signature makes Rolldown treat it as an entry: its file holds all of its exports, and
 * does not depend on which entries exist. A module whose id starts with `\0` is virtual and is left to Rolldown.
 *
 * Rolldown ends the file of a CommonJS module with `export default require_x();`, which runs the module as soon as
 * the file loads, so a package that requires a module only when a function runs, or inside a `try` that tolerates a
 * missing one, would run it on import. A file whose module is not an entry loses that line: its importers call the
 * `require_x` export when the module's code asks for it, as in a code-split build. A module that a dynamic `import()`
 * reaches keeps the line, since that import reads the default export and should run the module. A module that
 * becomes an entry or is dynamically imported later gains the line, which changes its file.
 */
export function createPreservedModuleSignaturesPlugin(entryPaths: Iterable<string>): RolldownPlugin {
	const entries = new Set([...entryPaths].map(fromRolldownModuleId));
	const emitted = new Set<string>();
	return {
		name: 'ecopages:preserved-module-signatures',
		buildStart() {
			emitted.clear();
		},
		moduleParsed(info) {
			if (info.id.startsWith('\0') || emitted.has(info.id)) return;
			emitted.add(info.id);
			this.emitFile({ type: 'chunk', id: info.id, preserveSignature: 'strict' });
		},
		renderChunk(code, chunk) {
			if (!chunk.facadeModuleId || entries.has(fromRolldownModuleId(chunk.facadeModuleId))) return null;
			if (this.getModuleInfo(chunk.facadeModuleId)?.dynamicImporters.length) return null;
			return COMMONJS_EXECUTION.test(code) ? { code: code.replace(COMMONJS_EXECUTION, ''), map: null } : null;
		},
	};
}
