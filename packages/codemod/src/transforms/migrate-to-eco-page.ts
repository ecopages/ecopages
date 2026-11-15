/**
 * Codemod: migrate-to-eco-page
 *
 * Transforms pages from the legacy pattern with separate exports to the consolidated eco.page() API.
 *
 * Before:
 *   export const getStaticPaths = ...
 *   export const getStaticProps = ...
 *   export const getMetadata = ...
 *   const Page: EcoComponent = () => ...
 *   Page.config = { layout, dependencies }
 *   export default Page
 *
 * After:
 *   export default eco.page({ layout, dependencies, paths, props, metadata, render })
 */

import type {
	API,
	FileInfo,
	Options,
	ASTPath,
	ExportDefaultDeclaration,
	JSCodeshift,
	Collection,
	VariableDeclarator,
} from 'jscodeshift';
import migrateDataHooks from './migrate-data-hooks.ts';
import { printOptions } from './print-options.ts';

export const parser = 'tsx';

interface ExtractedPageInfo {
	componentName: string | null;
	propsType: string | null;
	renderBody: unknown | null;
	layout: unknown | null;
	dependencies: unknown | null;
	staticPaths: unknown | null;
	staticProps: unknown | null;
	metadata: unknown | null;
	/** Data options the existing `eco.page(...)` call already sets. */
	declared: Set<PageDataKey>;
}

function readPagePropsTypeName(
	typeRef: { type?: string; typeName?: { type?: string; name?: string } } | undefined,
): string | null {
	if (typeRef?.type !== 'TSTypeReference' || typeRef.typeName?.type !== 'Identifier') {
		return null;
	}

	return typeRef.typeName.name ?? null;
}

function extractPagePropsType(id: { typeAnnotation?: unknown }): string | null {
	const typeRef = (
		id.typeAnnotation as { typeAnnotation?: { type?: string; typeParameters?: { params?: unknown[] } } } | undefined
	)?.typeAnnotation;
	if (typeRef?.type !== 'TSTypeReference' || !typeRef.typeParameters?.params?.length) {
		return null;
	}

	const firstParam = typeRef.typeParameters.params[0] as {
		type?: string;
		typeParameters?: { params?: unknown[] };
	};
	if (firstParam.type !== 'TSTypeReference' || !firstParam.typeParameters?.params?.length) {
		return null;
	}

	return readPagePropsTypeName(
		firstParam.typeParameters.params[0] as {
			type?: string;
			typeName?: { type?: string; name?: string };
		},
	);
}

function applyComponentDeclaratorToPageInfo(
	declarator: VariableDeclarator,
	componentName: string,
	info: ExtractedPageInfo,
): void {
	if (
		declarator.type !== 'VariableDeclarator' ||
		declarator.id?.type !== 'Identifier' ||
		declarator.id.name !== componentName
	) {
		return;
	}

	info.propsType = extractPagePropsType(declarator.id);

	if (declarator.init?.type === 'ArrowFunctionExpression' || declarator.init?.type === 'FunctionExpression') {
		info.renderBody = declarator.init;
	}
}

type PageDataKey = keyof Pick<ExtractedPageInfo, 'staticPaths' | 'staticProps' | 'metadata'>;

const LEGACY_EXPORT_TARGETS: Record<string, PageDataKey> = {
	getStaticPaths: 'staticPaths',
	getStaticProps: 'staticProps',
	getMetadata: 'metadata',
};

const LEGACY_WRAPPER_NAMES = new Set(['staticPaths', 'staticProps', 'metadata']);

function readLegacyTarget(exportName: string | undefined): PageDataKey | null {
	if (exportName === undefined || !Object.prototype.hasOwnProperty.call(LEGACY_EXPORT_TARGETS, exportName)) {
		return null;
	}
	return LEGACY_EXPORT_TARGETS[exportName];
}

/** Returns the function inside an `eco.staticPaths(fn)`, `eco.staticProps(fn)` or `eco.metadata(fn)` wrapper. */
function unwrapLegacyWrapper(value: unknown): unknown {
	const call = value as {
		type?: string;
		callee?: { type?: string; object?: { name?: string }; property?: { name?: string } };
		arguments?: unknown[];
	};
	if (
		call?.type === 'CallExpression' &&
		call.callee?.type === 'MemberExpression' &&
		call.callee.object?.name === 'eco' &&
		LEGACY_WRAPPER_NAMES.has(call.callee.property?.name ?? '') &&
		call.arguments?.length === 1
	) {
		return call.arguments[0];
	}
	return value;
}

function isReferencedByTypeof(j: JSCodeshift, root: Collection, name: string): boolean {
	return (
		root.find(j.TSTypeQuery).filter((path) => {
			const exprName = path.node.exprName as { type?: string; name?: string };
			return exprName.type === 'Identifier' && exprName.name === name;
		}).length > 0
	);
}

function toFunctionExpression(j: JSCodeshift, declaration: Record<string, unknown>): unknown {
	const expression = j.functionExpression(
		null,
		declaration.params as never,
		declaration.body as never,
		Boolean(declaration.generator),
	);
	expression.async = Boolean(declaration.async);
	(expression as { returnType?: unknown }).returnType = declaration.returnType;
	(expression as { typeParameters?: unknown }).typeParameters = declaration.typeParameters;
	return expression;
}

/**
 * Moves one `export const|function getX` declaration into the page info.
 *
 * @remarks
 * A declaration that a `typeof getX` type still names, or that the existing `eco.page(...)` call
 * already references, stays in the file unexported. Only the first case also sets the page option.
 */
function applyDeclaredPageExport(j: JSCodeshift, root: Collection, path: ASTPath, info: ExtractedPageInfo): boolean {
	const declaration = (path.node as { declaration?: Record<string, any> }).declaration;
	if (declaration?.type === 'VariableDeclaration') {
		return applyVariableExport(j, root, path, declaration, info);
	}
	if (declaration?.type === 'FunctionDeclaration') {
		return applyFunctionExport(j, root, path, declaration, info);
	}
	return false;
}

function applyVariableExport(
	j: JSCodeshift,
	root: Collection,
	path: ASTPath,
	declaration: Record<string, any>,
	info: ExtractedPageInfo,
): boolean {
	const declarator = declaration.declarations?.[0];
	if (declarator?.type !== 'VariableDeclarator' || declarator.id?.type !== 'Identifier' || !declarator.init) {
		return false;
	}
	const targetKey = readLegacyTarget(declarator.id.name);
	if (!targetKey) {
		return false;
	}

	const value = unwrapLegacyWrapper(declarator.init);
	const isDeclared = info.declared.has(targetKey);
	if (isDeclared || isReferencedByTypeof(j, root, declarator.id.name)) {
		declarator.init = value;
		if (!isDeclared) {
			declarator.id.typeAnnotation = null;
			info[targetKey] = j.identifier(declarator.id.name);
		}
		j(path).replaceWith(declaration);
		return true;
	}
	info[targetKey] = value;
	j(path).remove();
	return true;
}

function applyFunctionExport(
	j: JSCodeshift,
	root: Collection,
	path: ASTPath,
	declaration: Record<string, any>,
	info: ExtractedPageInfo,
): boolean {
	const targetKey = readLegacyTarget(declaration.id?.name);
	if (!targetKey) {
		return false;
	}

	const isDeclared = info.declared.has(targetKey);
	if (isDeclared || isReferencedByTypeof(j, root, declaration.id.name)) {
		if (!isDeclared) {
			info[targetKey] = j.identifier(declaration.id.name);
		}
		j(path).replaceWith(declaration);
		return true;
	}
	info[targetKey] = toFunctionExpression(j, declaration);
	j(path).remove();
	return true;
}

function findTopLevelDeclarator(root: Collection, j: JSCodeshift, name: string): Record<string, any> | null {
	let found: Record<string, any> | null = null;
	root.find(j.VariableDeclarator).forEach((path) => {
		const id = path.node.id as { type?: string; name?: string };
		const grandParent = path.parent?.parent?.node as { type?: string } | undefined;
		if (id.type === 'Identifier' && id.name === name && grandParent?.type === 'Program') {
			found = path.node as Record<string, any>;
		}
	});
	return found;
}

/** Moves the `export { local as getX }` specifiers into the page info and drops them from the list. */
function applyExportListSpecifiers(j: JSCodeshift, root: Collection, path: ASTPath, info: ExtractedPageInfo): boolean {
	const node = path.node as { source?: unknown; declaration?: unknown; specifiers?: Array<Record<string, any>> };
	if (node.declaration || node.source || !node.specifiers) {
		return false;
	}

	let moved = false;
	node.specifiers = node.specifiers.filter((specifier) => {
		const exportedName = specifier.exported?.name as string | undefined;
		const localName = specifier.local?.name as string | undefined;
		const targetKey = readLegacyTarget(exportedName);
		if (!targetKey || !localName) {
			return true;
		}
		const declarator = findTopLevelDeclarator(root, j, localName);
		if (declarator?.init) {
			declarator.init = unwrapLegacyWrapper(declarator.init);
		}
		if (!info.declared.has(targetKey)) {
			info[targetKey] = j.identifier(localName);
		}
		moved = true;
		return false;
	});

	if (moved && node.specifiers.length === 0) {
		j(path).remove();
	}
	return moved;
}

function extractNamedPageExports(j: JSCodeshift, root: Collection, info: ExtractedPageInfo): boolean {
	let hasChanges = false;

	root.find(j.ExportNamedDeclaration).forEach((path) => {
		if (applyDeclaredPageExport(j, root, path, info) || applyExportListSpecifiers(j, root, path, info)) {
			hasChanges = true;
		}
	});

	return hasChanges;
}

function isPageConfigAssignment(
	expr: {
		type?: string;
		left?: {
			type?: string;
			object?: { type?: string; name?: string };
			property?: { type?: string; name?: string };
		};
		right?: { type?: string };
	},
	componentName: string,
): boolean {
	return (
		expr.type === 'AssignmentExpression' &&
		expr.left?.type === 'MemberExpression' &&
		expr.left.object?.type === 'Identifier' &&
		expr.left.object.name === componentName &&
		expr.left.property?.type === 'Identifier' &&
		expr.left.property.name === 'config' &&
		expr.right?.type === 'ObjectExpression'
	);
}

function readLayoutAndDependenciesFromConfig(configObject: { properties?: unknown[] }, info: ExtractedPageInfo): void {
	for (const prop of configObject.properties ?? []) {
		const objectProp = prop as { type?: string; key?: { type?: string; name?: string }; value?: unknown };
		if (objectProp.type !== 'ObjectProperty' || objectProp.key?.type !== 'Identifier') {
			continue;
		}

		if (objectProp.key.name === 'layout') {
			info.layout = objectProp.value;
		} else if (objectProp.key.name === 'dependencies') {
			info.dependencies = objectProp.value;
		}
	}
}

function applyPageConfigAssignment(
	j: JSCodeshift,
	root: Collection,
	componentName: string,
	info: ExtractedPageInfo,
): boolean {
	let hasChanges = false;

	root.find(j.ExpressionStatement).forEach((path) => {
		const expr = path.node.expression as {
			type?: string;
			left?: {
				type?: string;
				object?: { type?: string; name?: string };
				property?: { type?: string; name?: string };
			};
			right?: { type?: string; properties?: unknown[] };
		};

		if (!isPageConfigAssignment(expr, componentName)) {
			return;
		}

		readLayoutAndDependenciesFromConfig(expr.right as { properties?: unknown[] }, info);
		j(path).remove();
		hasChanges = true;
	});

	return hasChanges;
}

function removeComponentVariableDeclaration(j: JSCodeshift, root: Collection, componentName: string): boolean {
	let hasChanges = false;

	root.find(j.VariableDeclaration).forEach((path) => {
		const declarator = path.node.declarations?.[0] as {
			type?: string;
			id?: { type?: string; name?: string };
		};
		if (
			declarator?.type !== 'VariableDeclarator' ||
			declarator.id?.type !== 'Identifier' ||
			declarator.id.name !== componentName
		) {
			return;
		}

		const parentNode = path.parent?.node as { type?: string } | undefined;
		if (parentNode?.type === 'ExportNamedDeclaration') {
			return;
		}

		j(path).remove();
		hasChanges = true;
	});

	return hasChanges;
}

function buildEcoPageExport(
	j: JSCodeshift,
	info: ExtractedPageInfo,
	defaultExportPath: ASTPath<ExportDefaultDeclaration> | null,
): void {
	const pageProperties: unknown[] = [];

	if (info.layout) {
		pageProperties.push(j.objectProperty(j.identifier('layout'), info.layout as never));
	}
	if (info.dependencies) {
		pageProperties.push(j.objectProperty(j.identifier('dependencies'), info.dependencies as never));
	}
	if (info.staticPaths) {
		pageProperties.push(j.objectProperty(j.identifier('staticPaths'), info.staticPaths as never));
	}
	if (info.staticProps) {
		pageProperties.push(j.objectProperty(j.identifier('staticProps'), info.staticProps as never));
	}
	if (info.metadata) {
		pageProperties.push(j.objectProperty(j.identifier('metadata'), info.metadata as never));
	}

	pageProperties.push(j.objectProperty(j.identifier('render'), info.renderBody as never));

	const ecoPageCall = j.callExpression(j.memberExpression(j.identifier('eco'), j.identifier('page')), [
		j.objectExpression(pageProperties as never),
	]);

	if (info.propsType) {
		(ecoPageCall as { typeParameters?: unknown }).typeParameters = j.tsTypeParameterInstantiation([
			j.tsTypeReference(j.identifier(info.propsType)),
		]);
	}

	if (defaultExportPath) {
		j(defaultExportPath).replaceWith(j.exportDefaultDeclaration(ecoPageCall));
	}
}

function ensureEcoImport(j: JSCodeshift, root: Collection): void {
	const ecoImports = root.find(j.ImportDeclaration, {
		source: { value: '@ecopages/core' },
	});

	let hasEcoImport = false;
	ecoImports.forEach((path) => {
		if (path.node.importKind === 'type') {
			return;
		}
		path.node.specifiers?.forEach((spec) => {
			if (
				spec.type === 'ImportSpecifier' &&
				spec.imported.type === 'Identifier' &&
				spec.imported.name === 'eco'
			) {
				hasEcoImport = true;
			}
		});
	});

	if (hasEcoImport) {
		return;
	}

	const newImport = j.importDeclaration([j.importSpecifier(j.identifier('eco'))], j.literal('@ecopages/core'));
	const firstImport = root.find(j.ImportDeclaration).at(0);
	if (firstImport.length > 0) {
		firstImport.insertBefore(newImport);
	} else {
		(root.get().node as { program: { body: unknown[] } }).program.body.unshift(newImport);
	}
}

function pruneLegacyPageTypeImports(j: JSCodeshift, root: Collection): void {
	const ecoImports = root.find(j.ImportDeclaration, {
		source: { value: '@ecopages/core' },
	});
	const typesToRemove = ['EcoComponent', 'GetStaticPaths', 'GetStaticProps', 'GetMetadata', 'PageProps'];

	ecoImports.forEach((path) => {
		if (!path.node.specifiers) {
			return;
		}

		path.node.specifiers = path.node.specifiers.filter((spec) => {
			if (spec.type === 'ImportSpecifier' && spec.imported.type === 'Identifier') {
				return !typesToRemove.includes(spec.imported.name);
			}
			return true;
		});

		if (path.node.specifiers.length === 0) {
			j(path).remove();
		}
	});
}

/** Whether `name` is still named anywhere in the file besides its import specifier. */
function isStillReferenced(j: JSCodeshift, root: Collection, name: string): boolean {
	return (
		root.find(j.Identifier, { name }).filter((path) => {
			const parentType = (path.parent?.node as { type?: string } | undefined)?.type;
			return parentType !== 'ImportSpecifier';
		}).length > 0
	);
}

function pruneUnusedLegacyTypeImports(j: JSCodeshift, root: Collection): void {
	root.find(j.ImportDeclaration, { source: { value: '@ecopages/core' } }).forEach((path) => {
		path.node.specifiers = path.node.specifiers?.filter((spec) => {
			if (spec.type !== 'ImportSpecifier' || spec.imported.type !== 'Identifier') {
				return true;
			}
			const name = spec.imported.name;
			return (
				!['GetStaticPaths', 'GetStaticProps', 'GetMetadata'].includes(name) || isStillReferenced(j, root, name)
			);
		});
		if (path.node.specifiers?.length === 0) {
			j(path).remove();
		}
	});
}

/** Adds the extracted data hooks to an existing `eco.page({...})` options object, ahead of `render`. */
function mergeIntoExistingEcoPage(j: JSCodeshift, ecoPageCall: Collection, info: ExtractedPageInfo): boolean {
	let merged = false;
	ecoPageCall.forEach((path) => {
		const options = (path.node as { arguments?: Array<{ type?: string; properties?: Array<Record<string, any>> }> })
			.arguments?.[0];
		if (options?.type !== 'ObjectExpression' || !options.properties) {
			return;
		}
		const present = new Set(options.properties.map((property) => property.key?.name as string | undefined));
		const additions = (['staticPaths', 'staticProps', 'metadata'] as const)
			.filter((key) => info[key] && !present.has(key))
			.map((key) => j.objectProperty(j.identifier(key), info[key] as never));
		if (additions.length === 0) {
			return;
		}
		const renderIndex = options.properties.findIndex((property) => property.key?.name === 'render');
		options.properties.splice(renderIndex === -1 ? options.properties.length : renderIndex, 0, ...additions);
		merged = true;
	});
	return merged;
}

function migratePage(file: FileInfo, api: API): string | null {
	const j = api.jscodeshift;
	const root = j(file.source);

	const existingEcoPage = root.find(j.CallExpression, {
		callee: {
			type: 'MemberExpression',
			object: { name: 'eco' },
			property: { name: 'page' },
		},
	});

	const info: ExtractedPageInfo = {
		componentName: null,
		propsType: null,
		renderBody: null,
		layout: null,
		dependencies: null,
		staticPaths: null,
		staticProps: null,
		metadata: null,
		declared: new Set(),
	};

	existingEcoPage.forEach((path) => {
		const options = (path.node as { arguments?: Array<{ type?: string; properties?: Array<Record<string, any>> }> })
			.arguments?.[0];
		for (const property of options?.type === 'ObjectExpression' ? (options.properties ?? []) : []) {
			const optionName = property.key?.name as string | undefined;
			if (optionName === 'staticPaths' || optionName === 'staticProps' || optionName === 'metadata') {
				info.declared.add(optionName);
			}
		}
	});

	let hasChanges = extractNamedPageExports(j, root, info);

	if (existingEcoPage.length > 0) {
		if (!hasChanges) {
			return null;
		}
		mergeIntoExistingEcoPage(j, existingEcoPage, info);
		pruneUnusedLegacyTypeImports(j, root);
		return root.toSource(printOptions(file.source));
	}

	let defaultExportPath: ASTPath<ExportDefaultDeclaration> | null = null;

	root.find(j.ExportDefaultDeclaration).forEach((path) => {
		defaultExportPath = path;
		const declaration = path.node.declaration as { type?: string; name?: string } | undefined;
		if (declaration?.type === 'Identifier') {
			info.componentName = declaration.name ?? null;
		}
	});

	if (info.componentName) {
		root.find(j.VariableDeclaration).forEach((path) => {
			const declarator = path.node.declarations?.[0];
			if (declarator?.type === 'VariableDeclarator') {
				applyComponentDeclaratorToPageInfo(declarator, info.componentName!, info);
			}
		});

		hasChanges = applyPageConfigAssignment(j, root, info.componentName, info) || hasChanges;
		hasChanges = removeComponentVariableDeclaration(j, root, info.componentName) || hasChanges;
	}

	if (!hasChanges || !info.renderBody) {
		return null;
	}

	buildEcoPageExport(j, info, defaultExportPath);
	ensureEcoImport(j, root);
	pruneLegacyPageTypeImports(j, root);

	return root.toSource(printOptions(file.source));
}

/**
 * Consolidates the legacy exports into `eco.page()`, then renames the data hooks and drops their envelopes
 * with `migrate-data-hooks`, so a page ends on the current API in one run.
 */
export default function transformer(file: FileInfo, api: API, options: Options): string | null {
	const migrated = migratePage(file, api);
	if (migrated === null) {
		return null;
	}
	return migrateDataHooks({ ...file, source: migrated }, api, options) ?? migrated;
}
