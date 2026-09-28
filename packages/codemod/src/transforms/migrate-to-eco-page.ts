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
 *   export default eco.page({ layout, dependencies, staticPaths, staticProps, metadata, render })
 */

import type { API, FileInfo, Options, ASTPath, ExportDefaultDeclaration, JSCodeshift, Collection } from 'jscodeshift';

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
}

function readPagePropsTypeName(
	typeRef: { type?: string; typeName?: { type?: string; name?: string } } | undefined,
): string | null {
	if (typeRef?.type !== 'TSTypeReference' || typeRef.typeName?.type !== 'Identifier') {
		return null;
	}

	return typeRef.typeName.name ?? null;
}

function extractPagePropsType(declarator: {
	id?: {
		typeAnnotation?: { typeAnnotation?: { type?: string; typeParameters?: { params?: unknown[] } } };
	};
}): string | null {
	const typeRef = declarator.id?.typeAnnotation?.typeAnnotation;
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
	declarator: {
		type?: string;
		id?: { type?: string; name?: string; typeAnnotation?: unknown };
		init?: { type?: string };
	},
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

	info.propsType = extractPagePropsType(declarator);

	if (declarator.init?.type === 'ArrowFunctionExpression' || declarator.init?.type === 'FunctionExpression') {
		info.renderBody = declarator.init;
	}
}

function applyNamedPageExport(j: JSCodeshift, path: ASTPath<unknown>, info: ExtractedPageInfo): boolean {
	const declaration = (path.node as { declaration?: { type?: string; declarations?: unknown[] } }).declaration;
	if (declaration?.type !== 'VariableDeclaration') {
		return false;
	}

	const declarator = declaration.declarations?.[0] as {
		type?: string;
		id?: { type?: string; name?: string };
		init?: unknown;
	};
	if (declarator?.type !== 'VariableDeclarator' || declarator.id?.type !== 'Identifier' || !declarator.init) {
		return false;
	}

	const exportName = declarator.id.name ?? '';
	const exportTargets: Record<string, keyof Pick<ExtractedPageInfo, 'staticPaths' | 'staticProps' | 'metadata'>> = {
		getStaticPaths: 'staticPaths',
		getStaticProps: 'staticProps',
		getMetadata: 'metadata',
	};
	if (!Object.prototype.hasOwnProperty.call(exportTargets, exportName)) {
		return false;
	}
	const targetKey = exportTargets[exportName];

	info[targetKey] = declarator.init;
	j(path).remove();
	return true;
}

function extractNamedPageExports(j: JSCodeshift, root: Collection<unknown>, info: ExtractedPageInfo): boolean {
	let hasChanges = false;

	root.find(j.ExportNamedDeclaration).forEach((path) => {
		if (applyNamedPageExport(j, path, info)) {
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
	root: Collection<unknown>,
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

function removeComponentVariableDeclaration(j: JSCodeshift, root: Collection<unknown>, componentName: string): boolean {
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

function ensureEcoImport(j: JSCodeshift, root: Collection<unknown>): void {
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

function pruneLegacyPageTypeImports(j: JSCodeshift, root: Collection<unknown>): void {
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

export default function transformer(file: FileInfo, api: API, _options: Options): string | null {
	const j = api.jscodeshift;
	const root = j(file.source);

	const existingEcoPage = root.find(j.CallExpression, {
		callee: {
			type: 'MemberExpression',
			object: { name: 'eco' },
			property: { name: 'page' },
		},
	});
	if (existingEcoPage.length > 0) {
		return null;
	}

	const info: ExtractedPageInfo = {
		componentName: null,
		propsType: null,
		renderBody: null,
		layout: null,
		dependencies: null,
		staticPaths: null,
		staticProps: null,
		metadata: null,
	};

	let hasChanges = extractNamedPageExports(j, root, info);

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
			if (declarator) {
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

	return root.toSource({ quote: 'single', tabWidth: 2, useTabs: true });
}
