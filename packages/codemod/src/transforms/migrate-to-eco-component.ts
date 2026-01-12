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

import type { API, FileInfo, Options, ASTPath } from 'jscodeshift';

export const parser = 'tsx';

interface ExtractedComponentInfo {
	componentName: string;
	propsType: string | null;
	renderBody: any;
	dependencies: any | null;
	exportType: 'named' | 'default';
	declarationPath: ASTPath<any>;
}

export default function transformer(file: FileInfo, api: API, _options: Options): string | null {
	const j = api.jscodeshift;
	const root = j(file.source);
	let hasChanges = false;

	// Skip if already using eco.component()
	const existingEcoComponent = root.find(j.CallExpression, {
		callee: {
			type: 'MemberExpression',
			object: { name: 'eco' },
			property: { name: 'component' },
		},
	});

	// Track components to transform
	const componentsToTransform: ExtractedComponentInfo[] = [];

	// Find Component.config = { ... } assignments
	root.find(j.ExpressionStatement).forEach((path) => {
		const expr = path.node.expression;
		if (
			expr.type === 'AssignmentExpression' &&
			expr.left.type === 'MemberExpression' &&
			expr.left.object.type === 'Identifier' &&
			expr.left.property.type === 'Identifier' &&
			expr.left.property.name === 'config' &&
			expr.right.type === 'ObjectExpression'
		) {
			const componentName = expr.left.object.name;

			// Skip if this component already uses eco.component
			let alreadyMigrated = false;
			existingEcoComponent.forEach((ecoPath) => {
				// Check if the eco.component call is for this component
				const parent = ecoPath.parent;
				if (parent?.node?.type === 'VariableDeclarator' && parent.node.id?.name === componentName) {
					alreadyMigrated = true;
				}
			});

			if (alreadyMigrated) {
				return;
			}

			// Extract dependencies from config
			let dependencies: any = null;
			expr.right.properties.forEach((prop) => {
				if (
					prop.type === 'ObjectProperty' &&
					prop.key.type === 'Identifier' &&
					prop.key.name === 'dependencies'
				) {
					dependencies = prop.value;
				}
			});

			// Find the component function declaration
			let componentFound = false;

			// Check variable declarations
			root.find(j.VariableDeclaration).forEach((varPath) => {
				const declarator = varPath.node.declarations[0];
				if (
					declarator?.type === 'VariableDeclarator' &&
					declarator.id.type === 'Identifier' &&
					declarator.id.name === componentName
				) {
					// Check if it's a function
					if (
						declarator.init?.type === 'ArrowFunctionExpression' ||
						declarator.init?.type === 'FunctionExpression'
					) {
						// Extract props type from EcoComponent<PropsType> or EcoComponent<PageProps<PropsType>>
						let propsType: string | null = null;
						if (declarator.id.typeAnnotation?.typeAnnotation?.type === 'TSTypeReference') {
							const typeRef = declarator.id.typeAnnotation.typeAnnotation;
							if (typeRef.typeParameters?.params?.length) {
								const firstParam = typeRef.typeParameters.params[0];
								if (
									firstParam.type === 'TSTypeReference' &&
									firstParam.typeName?.type === 'Identifier'
								) {
									// Could be direct type ref like EcoComponent<MyProps>
									// or nested like EcoComponent<PageProps<MyProps>>
									if (firstParam.typeParameters?.params?.length) {
										// Nested: extract inner type
										const innerParam = firstParam.typeParameters.params[0];
										if (
											innerParam.type === 'TSTypeReference' &&
											innerParam.typeName?.type === 'Identifier'
										) {
											propsType = innerParam.typeName.name;
										}
									} else {
										// Direct: use firstParam directly
										propsType = firstParam.typeName.name;
									}
								}
							}
						}

						// Determine export type
						const isExported = varPath.parent?.node?.type === 'ExportNamedDeclaration';

						componentsToTransform.push({
							componentName,
							propsType,
							renderBody: declarator.init,
							dependencies,
							exportType: isExported ? 'named' : 'default',
							declarationPath: isExported ? varPath.parent : varPath,
						});
						componentFound = true;
					}
				}
			});

			if (componentFound) {
				// Remove the config assignment
				j(path).remove();
				hasChanges = true;
			}
		}
	});

	// Transform each component
	for (const comp of componentsToTransform) {
		// Build eco.component({ dependencies, render }) call
		const componentProperties: any[] = [];

		if (comp.dependencies) {
			componentProperties.push(j.objectProperty(j.identifier('dependencies'), comp.dependencies));
		}

		componentProperties.push(j.objectProperty(j.identifier('render'), comp.renderBody));

		const ecoComponentCall = j.callExpression(j.memberExpression(j.identifier('eco'), j.identifier('component')), [
			j.objectExpression(componentProperties),
		]);

		// Add type parameter if we have props type
		if (comp.propsType) {
			(ecoComponentCall as any).typeParameters = j.tsTypeParameterInstantiation([
				j.tsTypeReference(j.identifier(comp.propsType)),
			]);
		}

		// Create the new variable declaration
		const newDeclarator = j.variableDeclarator(j.identifier(comp.componentName), ecoComponentCall);

		const newDeclaration = j.variableDeclaration('const', [newDeclarator]);

		// Replace the old declaration
		if (comp.exportType === 'named') {
			j(comp.declarationPath).replaceWith(j.exportNamedDeclaration(newDeclaration));
		} else {
			j(comp.declarationPath).replaceWith(newDeclaration);
		}

		hasChanges = true;
	}

	if (!hasChanges) {
		return null;
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

	// Remove EcoComponent type import if no longer needed
	ecoImports.forEach((path) => {
		if (path.node.specifiers) {
			path.node.specifiers = path.node.specifiers.filter((spec) => {
				if (spec.type === 'ImportSpecifier' && spec.imported.type === 'Identifier') {
					if (spec.imported.name === 'EcoComponent') {
						const usages = root.find(j.TSTypeReference, {
							typeName: { name: 'EcoComponent' },
						});
						return usages.length > 0;
					}
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
