import type { RolldownPlugin } from 'rolldown';
import { normalizePreservedModuleOutput } from './preserved-module-output.ts';
import { fromRolldownModuleId } from './rolldown-module-id.ts';

/**
 * Keeps every export of every module, whatever imports it, when each module is emitted as its own file.
 *
 * @param entryPaths - The modules the build was asked for.
 *
 * @remarks
 * With `preserveModules`, Rolldown writes a module that is not an entry with the exports and statements that
 * the other modules of the build use, so the file of a module changes when a later entry uses more of it, and the
 * dev server's vendor files would change for pages that already loaded them. Emitting each module as a chunk of
 * its own with a strict signature makes Rolldown treat it as an entry: its file holds all of its exports, and
 * does not depend on which entries exist. A module whose id starts with `\0` is virtual and is left to Rolldown.
 *
 * Two more things in a file depend on the modules that import it, and are undone once the bundle is generated:
 * the namespace object of a module that another module reads as a value, and the line that runs a CommonJS module
 * when its file loads. See {@link normalizePreservedModuleOutput}.
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
		generateBundle(_options, bundle) {
			const chunks = Object.values(bundle).filter((output) => output.type === 'chunk');
			for (const asset of normalizePreservedModuleOutput(chunks, entries)) {
				this.emitFile({ type: 'asset', fileName: asset.fileName, source: asset.source });
			}
		},
	};
}
