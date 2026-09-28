import type { ParseResult } from 'oxc-parser';
import {
	checkPotentialClientRoot,
	createClientRootScanState,
	type ClientRootScanState,
} from './reachability-client-roots.ts';
import { isPreloadExportStatement } from './reachability-preload.ts';

export type TopLevelImportEntry = {
	node: unknown;
	specifier: string;
	bindings: Map<string, string>;
	isSideEffect: boolean;
};

export type TopLevelIndex = {
	topLevelImports: TopLevelImportEntry[];
	topLevelDeclarations: Map<string, unknown>;
	clientRootState: ClientRootScanState;
};

function indexImportDeclaration(statement: any, topLevelImports: TopLevelImportEntry[]): void {
	if (statement.importKind === 'type') {
		return;
	}

	const specifier = statement.source.value as string;
	const bindings = new Map<string, string>();

	if (!statement.specifiers || statement.specifiers.length === 0) {
		topLevelImports.push({ node: statement, specifier, bindings, isSideEffect: true });
		return;
	}

	for (const spec of statement.specifiers) {
		if (spec.type === 'ImportDefaultSpecifier') {
			bindings.set(spec.local.name, 'default');
		} else if (spec.type === 'ImportNamespaceSpecifier') {
			bindings.set(spec.local.name, '*');
		} else if (spec.type === 'ImportSpecifier') {
			const importedName =
				spec.imported.type === 'Identifier' ? spec.imported.name : (spec.imported as { value: string }).value;
			bindings.set(spec.local.name, importedName);
		}
	}
	topLevelImports.push({ node: statement, specifier, bindings, isSideEffect: false });
}

function indexExportNamedDeclaration(statement: any, index: TopLevelIndex): void {
	const decl = statement.declaration;
	if (isPreloadExportStatement(statement)) {
		index.clientRootState.pagePreloadRoots.push(statement);
	}
	if (!decl) {
		return;
	}

	if (decl.type === 'FunctionDeclaration' || decl.type === 'ClassDeclaration') {
		if (decl.id?.type === 'Identifier') {
			index.topLevelDeclarations.set(decl.id.name, statement);
		}
		return;
	}

	if (decl.type === 'VariableDeclaration') {
		for (const v of decl.declarations) {
			if (v.id.type === 'Identifier') {
				index.topLevelDeclarations.set(v.id.name, statement);
				checkPotentialClientRoot(v.init, index.clientRootState);
			}
		}
	}
}

export function buildTopLevelIndex(program: ParseResult['program']): TopLevelIndex {
	const index: TopLevelIndex = {
		topLevelImports: [],
		topLevelDeclarations: new Map(),
		clientRootState: createClientRootScanState(),
	};

	for (const statement of program.body) {
		if (statement.type === 'ImportDeclaration') {
			indexImportDeclaration(statement, index.topLevelImports);
			continue;
		}

		if (statement.type === 'VariableDeclaration') {
			for (const decl of statement.declarations) {
				if (decl.id.type === 'Identifier') {
					index.topLevelDeclarations.set(decl.id.name, statement);
					checkPotentialClientRoot(decl.init, index.clientRootState);
				}
			}
			continue;
		}

		if (statement.type === 'FunctionDeclaration' || statement.type === 'ClassDeclaration') {
			if (statement.id?.type === 'Identifier') {
				index.topLevelDeclarations.set(statement.id.name, statement);
			}
			continue;
		}

		if (statement.type === 'ExportNamedDeclaration') {
			indexExportNamedDeclaration(statement, index);
			continue;
		}

		if (statement.type === 'ExportDefaultDeclaration') {
			checkPotentialClientRoot(statement.declaration, index.clientRootState);
			continue;
		}

		if (statement.type === 'ExpressionStatement') {
			checkPotentialClientRoot(statement.expression, index.clientRootState);
			continue;
		}

		if (statement.type === 'ExportAllDeclaration' && statement.source) {
			index.clientRootState.potentialClientRoots.push(statement);
		}
	}

	return index;
}
