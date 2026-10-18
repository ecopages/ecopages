import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import type { API, FileInfo, Options } from 'jscodeshift';
import ts from 'typescript';

export const parser = 'tsx';

const coreEntryBySubpath: Record<string, string> = {
	'assets/hashed-browser-asset': 'processor',
	'build/browser-runtime-manifest': 'build',
	'build/browser-runtime-plugin': 'build',
	'build/build-adapter': 'build',
	'build/build-queue': 'build',
	'build/contracts/content-virtual-modules': 'build/contracts',
	'build/contracts/server-only-specifier': 'build/contracts',
	'build/jsx-ownership-plugins': 'build',
	'build/lit-static-render-worker-context': 'build',
	'build/server-module': 'build',
	cache: 'build',
	'client/navigation-scripts': 'client',
	'client/scroll': 'client',
	'client/view-transitions': 'client',
	'config/app-runtime': 'integration',
	constants: 'build',
	'dev-toolbar/build-error-contract': 'client',
	'dev-toolbar/define-dev-tool': 'client',
	'dev-toolbar/dev-toolbar-manifest-contract': 'client',
	'dev/development-restart': 'build',
	'dev/transform-server': 'integration',
	'diagnostics/request-pipeline-metrics': 'build',
	'eco/page-layout-normalization': 'client',
	hash: 'build',
	'hmr/hmr-entrypoint-output': 'integration',
	'hmr/hmr-registered-entrypoints-context': 'integration',
	'hmr/hmr-strategy': 'integration',
	'internal/finalize-config': 'config',
	'plugins/define-integration': 'integration',
	'plugins/integration-plugin': 'integration',
	'plugins/jsx-import-source.utils': 'integration',
	'plugins/package-specifier': 'build',
	'plugins/processor': 'processor',
	'plugins/tsconfig-import-resolver': 'build',
	'route-renderer/orchestration/custom-element-scripts/custom-element-script-preloader': 'integration',
	'route-renderer/orchestration/custom-element-scripts/custom-element-server-module-importer': 'integration',
	'route-renderer/orchestration/custom-element-scripts/custom-element-ssr-preload-entrypoint': 'integration',
	'route-renderer/orchestration/document-shell/document-shell-render.service': 'integration',
	'route-renderer/orchestration/document-shell/layout-shell-props.service': 'integration',
	'route-renderer/orchestration/foreign-child/component-render-context': 'integration',
	'route-renderer/orchestration/foreign-child/foreign-subtree-execution.service': 'integration',
	'route-renderer/orchestration/integration-renderer': 'integration',
	'route-renderer/orchestration/page-browser-graph/page-browser-graph-merge.utils': 'integration',
	'route-renderer/orchestration/string-markup-renderer': 'integration',
	'route-renderer/page-loading/file-scoped-dependency-components': 'integration',
	'route-renderer/route-renderer': 'integration',
	'router/link-intent': 'client',
	'router/link-navigation-policy': 'client',
	'router/navigation-coordinator': 'client',
	'router/navigation-lifecycle': 'client',
	'router/navigation-pipeline': 'client',
	'services/asset-processing-service': 'integration',
	'utils/path-containment': 'build',
	'utils/resolve-entry-file': 'build',
};

function entrypointFor(specifier: string): string | undefined {
	const prefix = '@ecopages/core/';
	if (!specifier.startsWith(prefix)) {
		return undefined;
	}

	const entry = coreEntryBySubpath[specifier.slice(prefix.length)];
	return entry ? `${prefix}${entry}` : undefined;
}

function findCoreSourceRoot(): string | undefined {
	let directory = process.cwd();
	while (true) {
		const sourceRoot = path.join(directory, 'packages/core/src');
		if (existsSync(path.join(sourceRoot, 'client.ts'))) {
			return sourceRoot;
		}

		const parent = path.dirname(directory);
		if (parent === directory) {
			return undefined;
		}
		directory = parent;
	}
}

function resolveCoreModule(sourceRoot: string, fromFile: string, moduleSpecifier: string): string | undefined {
	const resolvedPath = path.resolve(path.dirname(fromFile), moduleSpecifier);
	const candidates = [
		resolvedPath,
		`${resolvedPath}.ts`,
		`${resolvedPath}.tsx`,
		path.join(resolvedPath, 'index.ts'),
		path.join(resolvedPath, 'index.tsx'),
	];
	return candidates.find(
		(candidate) => candidate.startsWith(sourceRoot) && existsSync(candidate) && statSync(candidate).isFile(),
	);
}

function namesFromExportDeclaration(
	statement: ts.ExportDeclaration,
	sourceFile: string,
	sourceRoot: string,
	visited: Set<string>,
): Set<string> {
	const names = new Set<string>();
	if (!statement.moduleSpecifier || !ts.isStringLiteral(statement.moduleSpecifier)) {
		if (statement.exportClause && ts.isNamedExports(statement.exportClause)) {
			for (const specifier of statement.exportClause.elements) {
				names.add(specifier.name.text);
			}
		}
		return names;
	}

	const target = resolveCoreModule(sourceRoot, sourceFile, statement.moduleSpecifier.text);
	if (!target) {
		return names;
	}

	if (!statement.exportClause) {
		return exportedNames(target, sourceRoot, visited);
	}

	if (ts.isNamedExports(statement.exportClause)) {
		for (const specifier of statement.exportClause.elements) {
			names.add(specifier.name.text);
		}
	} else {
		names.add(statement.exportClause.name.text);
	}
	return names;
}

function namesFromDeclaredExport(statement: ts.Statement): Set<string> {
	const names = new Set<string>();
	const modifiers = ts.canHaveModifiers(statement) ? ts.getModifiers(statement) : undefined;
	if (!modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
		return names;
	}
	if (modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword)) {
		names.add('default');
	} else if (ts.isVariableStatement(statement)) {
		for (const declaration of statement.declarationList.declarations) {
			if (ts.isIdentifier(declaration.name)) {
				names.add(declaration.name.text);
			}
		}
	} else if (
		ts.isFunctionDeclaration(statement) ||
		ts.isClassDeclaration(statement) ||
		ts.isInterfaceDeclaration(statement) ||
		ts.isTypeAliasDeclaration(statement) ||
		ts.isEnumDeclaration(statement)
	) {
		if (statement.name) {
			names.add(statement.name.text);
		}
	}
	return names;
}

function exportedNames(sourceFile: string, sourceRoot: string, visited = new Set<string>()): Set<string> {
	if (visited.has(sourceFile)) {
		return new Set();
	}
	visited.add(sourceFile);

	const source = readFileSync(sourceFile, 'utf8');
	const parsed = ts.createSourceFile(sourceFile, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
	const names = new Set<string>();
	for (const statement of parsed.statements) {
		const statementNames = ts.isExportDeclaration(statement)
			? namesFromExportDeclaration(statement, sourceFile, sourceRoot, visited)
			: namesFromDeclaredExport(statement);
		for (const name of statementNames) {
			names.add(name);
		}
	}

	return names;
}

function coreEntrypointNames(entrypoint: string, sourceRoot: string): Set<string> | undefined {
	const entryPath = entrypoint.replace('@ecopages/core/', '');
	const entryFile = resolveCoreModule(sourceRoot, path.join(sourceRoot, '__entry__.ts'), `./${entryPath}`);
	return entryFile ? exportedNames(entryFile, sourceRoot) : undefined;
}

function requestedNames(node: unknown): { names: string[] } | { reason: string } {
	const declaration = node as {
		type?: string;
		specifiers?: Array<{
			type?: string;
			imported?: { name?: string; value?: string };
			local?: { name?: string; value?: string };
		}>;
	};
	if (declaration.type === 'ExportAllDeclaration') {
		return { reason: 'wildcard re-exports cannot be verified' };
	}

	const specifiers = declaration.specifiers ?? [];
	if (specifiers.length === 0) {
		return { reason: 'side-effect imports cannot be verified' };
	}

	const names: string[] = [];
	for (const specifier of specifiers) {
		if (specifier.type === 'ImportNamespaceSpecifier') {
			return { reason: 'namespace imports cannot be verified' };
		}
		const imported =
			specifier.imported ??
			(specifier.type === 'ExportSpecifier' ? specifier.local : undefined) ??
			(specifier.type === 'ImportDefaultSpecifier' ? { name: 'default' } : undefined);
		const name = imported?.name ?? imported?.value;
		if (!name) {
			return { reason: 'the imported name cannot be verified' };
		}
		names.push(name);
	}
	return { names };
}

function warnUnsupported(file: FileInfo, specifier: string, entrypoint: string, detail: string): void {
	console.warn(
		`[migrate-core-entrypoints] ${file.path}: left ${specifier} unchanged for ${entrypoint}; ${detail}. Review this import manually.`,
	);
}

function literalValue(node: unknown): string | undefined {
	if (!node || typeof node !== 'object') {
		return undefined;
	}

	const literal = node as { type?: string; value?: unknown };
	return (literal.type === 'StringLiteral' || literal.type === 'Literal') && typeof literal.value === 'string'
		? literal.value
		: undefined;
}

function rewriteLiteral(node: unknown): boolean {
	const value = literalValue(node);
	const entrypoint = value ? entrypointFor(value) : undefined;
	if (!entrypoint || !node || typeof node !== 'object') {
		return false;
	}

	(node as { value?: unknown }).value = entrypoint;
	return true;
}

function warnUnverifiedDynamicAccess(node: unknown, file: FileInfo): void {
	const specifier = literalValue(node);
	const entrypoint = specifier ? entrypointFor(specifier) : undefined;
	if (specifier && entrypoint) {
		warnUnsupported(file, specifier, entrypoint, 'dynamic module access cannot be verified');
	}
}

function isImportMetaResolve(callee: unknown): boolean {
	const call = callee as
		| {
				type?: string;
				property?: { type?: string; name?: string };
				object?: {
					type?: string;
					property?: { type?: string; name?: string };
					meta?: { type?: string; name?: string };
				};
		  }
		| undefined;
	return (
		call?.type === 'MemberExpression' &&
		call.property?.name === 'resolve' &&
		call.object?.type === 'MetaProperty' &&
		call.object.property?.name === 'meta' &&
		call.object.meta?.type === 'Identifier' &&
		call.object.meta.name === 'import'
	);
}

function isRequireResolve(callee: unknown): boolean {
	const call = callee as
		| {
				type?: string;
				property?: { name?: string };
				object?: { type?: string; name?: string };
		  }
		| undefined;
	return (
		call?.type === 'MemberExpression' &&
		call.property?.name === 'resolve' &&
		call.object?.type === 'Identifier' &&
		call.object.name === 'require'
	);
}

function rewriteModuleImports(
	root: ReturnType<API['jscodeshift']>,
	j: API['jscodeshift'],
	file: FileInfo,
	sourceRoot: string | undefined,
): boolean {
	let changed = false;
	const staticDeclarations = [j.ImportDeclaration, j.ExportNamedDeclaration, j.ExportAllDeclaration];
	for (const nodeType of staticDeclarations) {
		root.find(nodeType).forEach((nodePath) => {
			const declaration = nodePath.node as { source?: unknown };
			const specifier = literalValue(declaration.source);
			const entrypoint = specifier ? entrypointFor(specifier) : undefined;
			if (!specifier || !entrypoint) {
				return;
			}
			if (!sourceRoot) {
				warnUnsupported(file, specifier, entrypoint, 'the matching Ecopages source checkout was not found');
				return;
			}

			const requested = requestedNames(nodePath.node);
			if ('reason' in requested) {
				warnUnsupported(file, specifier, entrypoint, requested.reason);
				return;
			}
			const availableNames = coreEntrypointNames(entrypoint, sourceRoot);
			if (!availableNames) {
				warnUnsupported(file, specifier, entrypoint, `the ${entrypoint} entry could not be inspected`);
				return;
			}
			const missing = requested.names.filter((name) => !availableNames.has(name));
			if (missing.length > 0) {
				warnUnsupported(
					file,
					specifier,
					entrypoint,
					`${missing.map((name) => `'${name}'`).join(', ')} ${missing.length === 1 ? 'is' : 'are'} not exported`,
				);
				return;
			}

			changed = rewriteLiteral(declaration.source) || changed;
		});
	}

	root.find(j.CallExpression).forEach((path) => {
		const call = path.node as { callee?: { type?: string; name?: string }; arguments?: unknown[] };
		if (!call.arguments?.length) {
			return;
		}
		if (isImportMetaResolve(call.callee) || isRequireResolve(call.callee)) {
			changed = rewriteLiteral(call.arguments[0]) || changed;
		} else if (
			call.callee?.type === 'Import' ||
			(call.callee?.type === 'Identifier' && call.callee.name === 'require')
		) {
			warnUnverifiedDynamicAccess(call.arguments[0], file);
		}
	});

	root.find(j.ImportExpression).forEach((path) => {
		warnUnverifiedDynamicAccess((path.node as { source?: unknown }).source, file);
	});

	return changed;
}

export default function transformer(file: FileInfo, api: API, _options: Options): string | null {
	const j = api.jscodeshift;
	const root = j(file.source);
	if (!rewriteModuleImports(root, j, file, findCoreSourceRoot())) {
		return null;
	}

	return root.toSource({ quote: 'single', tabWidth: 2, useTabs: true });
}
