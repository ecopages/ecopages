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

import type { API, FileInfo, Options, ASTPath, ExportDefaultDeclaration } from 'jscodeshift';

export const parser = 'tsx';

interface ExtractedPageInfo {
	componentName: string | null;
	propsType: string | null;
	renderBody: any | null;
	layout: any | null;
	dependencies: any | null;
	staticPaths: any | null;
	staticProps: any | null;
	metadata: any | null;
}

export default function transformer(file: FileInfo, api: API, _options: Options): string | null {
	const j = api.jscodeshift;
	const root = j(file.source);
	let hasChanges = false;

	// Skip if already using eco.page()
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

	// Find and extract getStaticPaths
	root.find(j.ExportNamedDeclaration).forEach((path) => {
		const declaration = path.node.declaration;
		if (declaration?.type === 'VariableDeclaration') {
			const declarator = declaration.declarations[0];
			if (declarator?.type === 'VariableDeclarator' && declarator.id.type === 'Identifier') {
				const name = declarator.id.name;
				if (name === 'getStaticPaths' && declarator.init) {
					info.staticPaths = declarator.init;
					j(path).remove();
					hasChanges = true;
				} else if (name === 'getStaticProps' && declarator.init) {
					info.staticProps = declarator.init;
					j(path).remove();
					hasChanges = true;
				} else if (name === 'getMetadata' && declarator.init) {
					info.metadata = declarator.init;
					j(path).remove();
					hasChanges = true;
				}
			}
		}
	});

	// Find the page component and its config
	let defaultExportPath: ASTPath<ExportDefaultDeclaration> | null = null;

	root.find(j.ExportDefaultDeclaration).forEach((path) => {
		defaultExportPath = path;
		const declaration = path.node.declaration;
		if (declaration?.type === 'Identifier') {
			info.componentName = declaration.name;
		}
	});

	// If we have a named component, find its definition and config
	if (info.componentName) {
		// Find the component function
		root.find(j.VariableDeclaration).forEach((path) => {
			const declarator = path.node.declarations[0];
			if (
				declarator?.type === 'VariableDeclarator' &&
				declarator.id.type === 'Identifier' &&
				declarator.id.name === info.componentName
			) {
				// Extract props type from type annotation if present
				if (declarator.id.typeAnnotation?.typeAnnotation?.type === 'TSTypeReference') {
					const typeRef = declarator.id.typeAnnotation.typeAnnotation;
					// Check for EcoComponent<PageProps<T>> pattern
					if (typeRef.typeParameters?.params?.length) {
						const firstParam = typeRef.typeParameters.params[0];
						if (firstParam.type === 'TSTypeReference' && firstParam.typeParameters?.params?.length) {
							const propsType = firstParam.typeParameters.params[0];
							if (propsType.type === 'TSTypeReference' && propsType.typeName.type === 'Identifier') {
								info.propsType = propsType.typeName.name;
							}
						}
					}
				}

				// Extract render body
				if (
					declarator.init?.type === 'ArrowFunctionExpression' ||
					declarator.init?.type === 'FunctionExpression'
				) {
					info.renderBody = declarator.init;
				}
			}
		});

		// Find Component.config = { ... }
		root.find(j.ExpressionStatement).forEach((path) => {
			const expr = path.node.expression;
			if (
				expr.type === 'AssignmentExpression' &&
				expr.left.type === 'MemberExpression' &&
				expr.left.object.type === 'Identifier' &&
				expr.left.object.name === info.componentName &&
				expr.left.property.type === 'Identifier' &&
				expr.left.property.name === 'config' &&
				expr.right.type === 'ObjectExpression'
			) {
				// Extract layout and dependencies from config
				expr.right.properties.forEach((prop) => {
					if (prop.type === 'ObjectProperty' && prop.key.type === 'Identifier') {
						if (prop.key.name === 'layout') {
							info.layout = prop.value;
						} else if (prop.key.name === 'dependencies') {
							info.dependencies = prop.value;
						}
					}
				});
				j(path).remove();
				hasChanges = true;
			}
		});

		// Remove the component variable declaration
		root.find(j.VariableDeclaration).forEach((path) => {
			const declarator = path.node.declarations[0];
			if (
				declarator?.type === 'VariableDeclarator' &&
				declarator.id.type === 'Identifier' &&
				declarator.id.name === info.componentName
			) {
				// Check if this is not already part of an export
				if (path.parent?.node?.type !== 'ExportNamedDeclaration') {
					j(path).remove();
					hasChanges = true;
				}
			}
		});
	}

	// Only proceed if we have something to transform
	if (!hasChanges || !info.renderBody) {
		return null;
	}

	// Build the eco.page() call
	const pageProperties: any[] = [];

	if (info.layout) {
		pageProperties.push(j.objectProperty(j.identifier('layout'), info.layout));
	}

	if (info.dependencies) {
		pageProperties.push(j.objectProperty(j.identifier('dependencies'), info.dependencies));
	}

	if (info.staticPaths) {
		pageProperties.push(j.objectProperty(j.identifier('staticPaths'), info.staticPaths));
	}

	if (info.staticProps) {
		pageProperties.push(j.objectProperty(j.identifier('staticProps'), info.staticProps));
	}

	if (info.metadata) {
		pageProperties.push(j.objectProperty(j.identifier('metadata'), info.metadata));
	}

	// Add render function
	pageProperties.push(j.objectProperty(j.identifier('render'), info.renderBody));

	// Create eco.page<PropsType>({ ... }) call
	const ecoPageCall = j.callExpression(j.memberExpression(j.identifier('eco'), j.identifier('page')), [
		j.objectExpression(pageProperties),
	]);

	// Add type parameter if we have props type
	if (info.propsType) {
		(ecoPageCall as any).typeParameters = j.tsTypeParameterInstantiation([
			j.tsTypeReference(j.identifier(info.propsType)),
		]);
	}

	// Replace the default export
	if (defaultExportPath) {
		j(defaultExportPath).replaceWith(j.exportDefaultDeclaration(ecoPageCall));
	}

	// Update imports: add eco, remove unused types
	const ecoImports = root.find(j.ImportDeclaration, {
		source: { value: '@ecopages/core' },
	});

	// Check if 'eco' is already imported as a value (not type)
	let hasEcoImport = false;
	ecoImports.forEach((path) => {
		// Skip type-only imports
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

	if (!hasEcoImport) {
		// Add new value import for eco
		const newImport = j.importDeclaration([j.importSpecifier(j.identifier('eco'))], j.literal('@ecopages/core'));
		const firstImport = root.find(j.ImportDeclaration).at(0);
		if (firstImport.length > 0) {
			firstImport.insertBefore(newImport);
		} else {
			root.get().node.program.body.unshift(newImport);
		}
	}

	// Remove unused type imports
	const typesToRemove = ['EcoComponent', 'GetStaticPaths', 'GetStaticProps', 'GetMetadata', 'PageProps'];
	ecoImports.forEach((path) => {
		if (path.node.specifiers) {
			path.node.specifiers = path.node.specifiers.filter((spec) => {
				if (spec.type === 'ImportSpecifier' && spec.imported.type === 'Identifier') {
					return !typesToRemove.includes(spec.imported.name);
				}
				return true;
			});
			// Remove the import entirely if it has no specifiers left
			if (path.node.specifiers.length === 0) {
				j(path).remove();
			}
		}
	});

	return root.toSource({ quote: 'single', tabWidth: 2, useTabs: true });
}
