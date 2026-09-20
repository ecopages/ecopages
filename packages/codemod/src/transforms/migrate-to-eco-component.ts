/**
 * Codemod: migrate-to-eco-component
 *
 * Transforms components from the legacy pattern with .config assignment to eco.component() API.
 *
 * Before:
 *   export const Counter: EcoComponent<Props> = ({ count }) => <my-counter />;
 *   Counter.config = { dependencies: { scripts, stylesheets } };
 *
 * After:
 *   export const Counter = eco.component<Props>({
 *     dependencies: { scripts, stylesheets },
 *     render: ({ count }) => <my-counter />,
 *   });
 */

import type { API, FileInfo, Options, ASTPath, JSCodeshift, Collection } from 'jscodeshift';

export const parser = 'tsx';

interface ExtractedComponentInfo {
	componentName: string;
	propsType: string | null;
	renderBody: unknown;
	dependencies: unknown | null;
	exportType: 'named' | 'default';
	declarationPath: ASTPath<unknown>;
}

type TsTypeReferenceNode = {
	type?: string;
	typeName?: { type?: string; name?: string };
	typeParameters?: { params?: unknown[] };
};

function identifierFromTypeReference(node: TsTypeReferenceNode): string | null {
	if (node.type !== 'TSTypeReference' || node.typeName?.type !== 'Identifier') {
		return null;
	}
	return node.typeName.name ?? null;
}

function extractEcoComponentPropsType(declarator: {
	typeAnnotation?: { typeAnnotation?: { type?: string; typeParameters?: { params?: unknown[] } } };
}): string | null {
	if (declarator.typeAnnotation?.typeAnnotation?.type !== 'TSTypeReference') {
		return null;
	}

	const typeRef = declarator.typeAnnotation.typeAnnotation;
	const firstParam = typeRef.typeParameters?.params?.[0] as TsTypeReferenceNode | undefined;
	if (!firstParam) {
		return null;
	}

	const nestedParam = firstParam.typeParameters?.params?.[0] as TsTypeReferenceNode | undefined;
	if (nestedParam) {
		return identifierFromTypeReference(nestedParam);
	}

	return identifierFromTypeReference(firstParam);
}

function tryExtractComponentFromVariableDeclaration(
	j: JSCodeshift,
	varPath: ASTPath<unknown>,
	componentName: string,
	dependencies: unknown | null,
): ExtractedComponentInfo | null {
	const node = varPath.node as {
		declarations?: Array<{
			type?: string;
			id?: { type?: string; name?: string; typeAnnotation?: unknown };
			init?: { type?: string };
		}>;
	};
	const declarator = node.declarations?.[0];
	if (
		declarator?.type !== 'VariableDeclarator' ||
		declarator.id?.type !== 'Identifier' ||
		declarator.id.name !== componentName
	) {
		return null;
	}

	if (declarator.init?.type !== 'ArrowFunctionExpression' && declarator.init?.type !== 'FunctionExpression') {
		return null;
	}

	const propsType = extractEcoComponentPropsType(declarator.id);
	const parentNode = varPath.parent?.node as { type?: string } | undefined;
	const isExported = parentNode?.type === 'ExportNamedDeclaration';

	return {
		componentName,
		propsType,
		renderBody: declarator.init,
		dependencies,
		exportType: isExported ? 'named' : 'default',
		declarationPath: isExported ? (varPath.parent as ASTPath<unknown>) : varPath,
	};
}

function extractDependenciesFromConfig(configObject: { properties?: unknown[] }): unknown | null {
	for (const prop of configObject.properties ?? []) {
		const objectProp = prop as { type?: string; key?: { type?: string; name?: string }; value?: unknown };
		if (
			objectProp.type === 'ObjectProperty' &&
			objectProp.key?.type === 'Identifier' &&
			objectProp.key.name === 'dependencies'
		) {
			return objectProp.value;
		}
	}
	return null;
}

function isComponentConfigAssignment(expr: { type?: string; left?: unknown; right?: { type?: string } }): {
	componentName: string;
	configObject: { properties?: unknown[] };
} | null {
	if (expr.type !== 'AssignmentExpression') {
		return null;
	}

	const left = expr.left as {
		type?: string;
		object?: { type?: string; name?: string };
		property?: { type?: string; name?: string };
	};
	if (
		left.type !== 'MemberExpression' ||
		left.object?.type !== 'Identifier' ||
		left.property?.type !== 'Identifier' ||
		left.property.name !== 'config' ||
		expr.right?.type !== 'ObjectExpression'
	) {
		return null;
	}

	return {
		componentName: left.object.name ?? '',
		configObject: expr.right as { properties?: unknown[] },
	};
}

function componentAlreadyUsesEco(existingEcoComponent: Collection<unknown>, componentName: string): boolean {
	let alreadyMigrated = false;
	existingEcoComponent.forEach((ecoPath) => {
		const parent = ecoPath.parent?.node as { type?: string; id?: { name?: string } } | undefined;
		if (parent?.type === 'VariableDeclarator' && parent.id?.name === componentName) {
			alreadyMigrated = true;
		}
	});
	return alreadyMigrated;
}

function replaceComponentDeclaration(j: JSCodeshift, root: Collection<unknown>, comp: ExtractedComponentInfo): void {
	const componentProperties: unknown[] = [];

	if (comp.dependencies) {
		componentProperties.push(j.objectProperty(j.identifier('dependencies'), comp.dependencies as never));
	}

	componentProperties.push(j.objectProperty(j.identifier('render'), comp.renderBody as never));

	const ecoComponentCall = j.callExpression(j.memberExpression(j.identifier('eco'), j.identifier('component')), [
		j.objectExpression(componentProperties as never),
	]);

	if (comp.propsType) {
		(ecoComponentCall as { typeParameters?: unknown }).typeParameters = j.tsTypeParameterInstantiation([
			j.tsTypeReference(j.identifier(comp.propsType)),
		]);
	}

	const newDeclarator = j.variableDeclarator(j.identifier(comp.componentName), ecoComponentCall);
	const newDeclaration = j.variableDeclaration('const', [newDeclarator]);

	if (comp.exportType === 'named') {
		j(comp.declarationPath).replaceWith(j.exportNamedDeclaration(newDeclaration));
	} else {
		j(comp.declarationPath).replaceWith(newDeclaration);
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

function pruneUnusedLegacyComponentTypeImports(j: JSCodeshift, root: Collection<unknown>): void {
	const unusedTypeNames = new Set(['EcoComponent', 'PageProps']);
	const ecoImports = root.find(j.ImportDeclaration, {
		source: { value: '@ecopages/core' },
	});

	ecoImports.forEach((path) => {
		if (!path.node.specifiers) {
			return;
		}

		path.node.specifiers = path.node.specifiers.filter((spec) => {
			if (spec.type === 'ImportSpecifier' && spec.imported.type === 'Identifier') {
				const importedName = spec.imported.name;
				if (unusedTypeNames.has(importedName)) {
					const usages = root.find(j.TSTypeReference, {
						typeName: { name: importedName },
					});
					return usages.length > 0;
				}
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
	let hasChanges = false;

	const existingEcoComponent = root.find(j.CallExpression, {
		callee: {
			type: 'MemberExpression',
			object: { name: 'eco' },
			property: { name: 'component' },
		},
	});

	const componentsToTransform: ExtractedComponentInfo[] = [];

	root.find(j.ExpressionStatement).forEach((path) => {
		const assignment = isComponentConfigAssignment(path.node.expression as never);
		if (!assignment) {
			return;
		}

		const { componentName, configObject } = assignment;
		if (componentAlreadyUsesEco(existingEcoComponent, componentName)) {
			return;
		}

		const dependencies = extractDependenciesFromConfig(configObject);
		let componentFound = false;

		root.find(j.VariableDeclaration).forEach((varPath) => {
			const extracted = tryExtractComponentFromVariableDeclaration(j, varPath, componentName, dependencies);
			if (!extracted) {
				return;
			}

			componentsToTransform.push(extracted);
			componentFound = true;
		});

		if (componentFound) {
			j(path).remove();
			hasChanges = true;
		}
	});

	for (const comp of componentsToTransform) {
		replaceComponentDeclaration(j, root, comp);
		hasChanges = true;
	}

	if (!hasChanges) {
		return null;
	}

	ensureEcoImport(j, root);
	pruneUnusedLegacyComponentTypeImports(j, root);

	return root.toSource({ quote: 'single', tabWidth: 2, useTabs: true });
}
