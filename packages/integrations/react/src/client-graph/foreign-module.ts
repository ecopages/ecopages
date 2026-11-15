import type { ComponentIdentity } from '@ecopages/core';
import { parseModuleSource, readExportedComponentIdentities, toRootRelativePath } from '@ecopages/core/build';
import { fileSystem } from '@ecopages/file-system';
import { path } from '@ecopages/file-system/path';

/** What React's browser graph needs to know about the exports of a module another Integration owns. */
export type ForeignModule = {
	/** Exports that are statically an `eco.*()` call, by name: React gets each from the stub module. */
	identities: ReadonlyMap<string, ComponentIdentity>;
	/** Every other value export: React gets it from the module itself, behind the runtime boundary. */
	values: ReadonlySet<string>;
	/** Whether the module also has an `export * from`, whose names are not known without following it. */
	star: boolean;
};

/** The specifier scheme of a stub module; the rest of the specifier is the foreign file, relative to the app root. */
export const FOREIGN_STUB_SCHEME = 'ecopages-react-foreign-stub:';

/**
 * The module id a stub specifier resolves to: the specifier behind `\0`, a virtual id no other plugin loads or
 * transforms, and that names no path of the machine that built it.
 */
export const FOREIGN_STUB_ID_PREFIX = `\0${FOREIGN_STUB_SCHEME}`;

/** A name as an export or import specifier writes it: bare when it is an identifier, quoted otherwise. */
export function exportSpecifierName(name: string): string {
	return /^[A-Za-z_$][\w$]*$/.test(name) ? name : JSON.stringify(name);
}

/** The specifier React's graph imports the stub module of the foreign file `filePath` with. */
export function toForeignStubSpecifier(projectRoot: string, filePath: string): string {
	return `${FOREIGN_STUB_SCHEME}${toRootRelativePath(projectRoot, filePath)}`;
}

/** The foreign file a stub specifier names. */
export function fromForeignStubSpecifier(projectRoot: string, specifier: string): string {
	return path.resolve(projectRoot, specifier.slice(FOREIGN_STUB_SCHEME.length));
}

/**
 * Returns the source of the stub module of a foreign file: one boundary per static Component export, built from
 * its identity, and no import of the file or of anything it imports.
 *
 * @remarks
 * Each boundary comes from `foreignBoundaryReference`, which keeps one boundary type per identity, so a stub that a
 * development transform inlines into several modules still gives React one Component type.
 */
export function createForeignStubSource(module: ForeignModule, boundaryPackage: string): string {
	const lines = [`import { foreignBoundaryReference } from ${JSON.stringify(boundaryPackage)};`];
	const exported: string[] = [];
	let index = 0;
	for (const [name, identity] of module.identities) {
		const local = `__eco_stub_${index++}`;
		lines.push(`const ${local} = /* @__PURE__ */ foreignBoundaryReference(${JSON.stringify(identity)});`);
		exported.push(`${local} as ${exportSpecifierName(name)}`);
	}
	lines.push(`export { ${exported.join(', ')} };`);
	return `${lines.join('\n')}\n`;
}

/** Declarations the build erases, so they are no value export; an `enum` stays a value. */
const TYPE_DECLARATIONS = new Set(['TSInterfaceDeclaration', 'TSTypeAliasDeclaration', 'TSModuleDeclaration']);

function exportName(node: any): string {
	return node.type === 'Identifier' ? node.name : String(node.value);
}

/** Adds the names one `export` declaration or specifier list declares; `true` when a name cannot be read. */
function addNamedExports(node: any, names: Set<string>): boolean {
	let unknown = false;
	const declaration = node.declaration;
	if (declaration?.type === 'VariableDeclaration') {
		for (const declarator of declaration.declarations) {
			if (declarator.id.type === 'Identifier') names.add(declarator.id.name);
			else unknown = true;
		}
	} else if (
		declaration?.id?.type === 'Identifier' &&
		!declaration.declare &&
		!TYPE_DECLARATIONS.has(declaration.type)
	) {
		names.add(declaration.id.name);
	}
	for (const specifier of node.specifiers ?? []) {
		if (specifier.exportKind !== 'type') names.add(exportName(specifier.exported));
	}
	return unknown;
}

/** The value export names a module declares itself or through `export ... from`, and whether it has an `export *`. */
function readValueExports(filePath: string, source: string): { names: Set<string>; star: boolean } {
	const names = new Set<string>();
	let star = false;
	const { program } = parseModuleSource(filePath, source);
	for (const node of program.body as any[]) {
		if (node.type === 'ExportDefaultDeclaration') {
			names.add('default');
		} else if (node.type === 'ExportNamedDeclaration' && node.exportKind !== 'type') {
			star = addNamedExports(node, names) || star;
		} else if (node.type === 'ExportAllDeclaration' && node.exportKind !== 'type') {
			if (node.exported) names.add(exportName(node.exported));
			else star = true;
		}
	}
	return { names, star };
}

/**
 * Returns the lookup of a foreign file's exports for React's browser graph.
 *
 * @remarks
 * `rootDir` must be the app root core attributes identities against, so the ids match the ones the server
 * renders. A file is read on each lookup and parsed again only when its source changed, so a development edit is
 * seen without a separate invalidation. A file no Integration owns, or that does not read or parse, has no entry.
 * A destructured export makes the module count as having unknown names, like `export *`.
 */
export function createForeignModuleReader(options: {
	rootDir: string;
	integrationOf: (filePath: string) => string | undefined;
}): (filePath: string) => ForeignModule | undefined {
	const cache = new Map<string, { source: string; module: ForeignModule | undefined }>();
	return (filePath) => {
		const integration = options.integrationOf(filePath);
		if (!integration) return undefined;
		let source: string;
		try {
			source = fileSystem.readFileSync(filePath);
		} catch {
			return undefined;
		}
		const cached = cache.get(filePath);
		if (cached?.source === source) return cached.module;
		let module: ForeignModule | undefined;
		try {
			const identities = readExportedComponentIdentities(source, filePath, {
				integration,
				projectRoot: options.rootDir,
			});
			const { names, star } = readValueExports(filePath, source);
			module = { identities, values: new Set([...names].filter((name) => !identities.has(name))), star };
		} catch {
			module = undefined;
		}
		cache.set(filePath, { source, module });
		return module;
	};
}
