import { path } from '@ecopages/file-system/path';
import { fileSystem } from '@ecopages/file-system';
import {
	Processor,
	resolveGeneratedPath,
	serializeStylesheetModuleDeclarations,
	writeGeneratedTypesPackage,
	type ProcessorConfig,
} from '../../plugins/processor.ts';

/** The config of a {@link DeclaringProcessor}: a `stylesheet` capability for `*.scss` that scopes CSS Modules. */
export const DECLARING_PROCESSOR_CONFIG: ProcessorConfig = {
	name: 'declaring',
	capabilities: [{ kind: 'stylesheet', extensions: ['*.css', '*.scss'], cssModules: true }],
};

/**
 * A stylesheet Processor that declares the module types of its extensions in `setup()`, as a third-party Sass
 * Processor does: the declarations go into its own generated `@types` package, which TypeScript loads on its own.
 */
export class DeclaringProcessor extends Processor {
	constructor(config: ProcessorConfig = DECLARING_PROCESSOR_CONFIG) {
		super(config);
	}

	override async setup(): Promise<void> {
		const declarations = serializeStylesheetModuleDeclarations(this.getAssetCapabilities());
		if (!declarations || !this.context) return;
		const write = (filePath: string, content: string) => {
			fileSystem.ensureDir(path.dirname(filePath));
			fileSystem.write(filePath, content);
		};
		writeGeneratedTypesPackage({
			root: this.context.rootDir,
			module: this.name,
			packageName: `@types/ecopages-${this.name}`,
			writeFile: write,
		});
		write(
			resolveGeneratedPath('types', { root: this.context.rootDir, module: this.name, subPath: 'index.d.ts' }),
			declarations,
		);
	}
}
