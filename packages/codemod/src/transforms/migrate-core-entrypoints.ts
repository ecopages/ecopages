import type { API, FileInfo, Options } from 'jscodeshift';

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

function rewriteLiteral(node: unknown): boolean {
	if (!node || typeof node !== 'object') {
		return false;
	}

	const literal = node as { type?: string; value?: unknown };
	if (literal.type !== 'StringLiteral' && literal.type !== 'Literal') {
		return false;
	}
	if (typeof literal.value !== 'string') {
		return false;
	}

	const entrypoint = entrypointFor(literal.value);
	if (!entrypoint) {
		return false;
	}

	literal.value = entrypoint;
	return true;
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

function rewriteModuleImports(root: ReturnType<API['jscodeshift']>, j: API['jscodeshift']): boolean {
	let changed = false;
	for (const nodeType of [j.ImportDeclaration, j.ExportNamedDeclaration, j.ExportAllDeclaration]) {
		root.find(nodeType).forEach((path) => {
			const declaration = path.node as { source?: unknown };
			changed = rewriteLiteral(declaration.source) || changed;
		});
	}

	root.find(j.CallExpression).forEach((path) => {
		const call = path.node as { callee?: { type?: string; name?: string }; arguments?: unknown[] };
		const isAllowedCall =
			call.callee?.type === 'Import' ||
			(call.callee?.type === 'Identifier' && call.callee.name === 'require') ||
			isImportMetaResolve(call.callee);
		if (!isAllowedCall || !call.arguments?.length) {
			return;
		}
		changed = rewriteLiteral(call.arguments[0]) || changed;
	});

	root.find(j.ImportExpression).forEach((path) => {
		changed = rewriteLiteral((path.node as { source?: unknown }).source) || changed;
	});

	return changed;
}

export default function transformer(file: FileInfo, api: API, _options: Options): string | null {
	const j = api.jscodeshift;
	const root = j(file.source);
	if (!rewriteModuleImports(root, j)) {
		return null;
	}

	return root.toSource({ quote: 'single', tabWidth: 2, useTabs: true });
}
