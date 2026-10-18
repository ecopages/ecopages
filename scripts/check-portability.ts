import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

/**
 * Repository root resolved from this script location.
 */
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Source file extensions scanned by the portability checks.
 */
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts']);

/**
 * A portability rule applied across one or more repository roots.
 */
type Check = {
	id: string;
	roots: string[];
	message: string;
	match: (relativePath: string, content: string) => number[];
	shouldSkip?: (relativePath: string) => boolean;
};

/**
 * A concrete portability violation found during scanning.
 */
type Violation = {
	checkId: string;
	message: string;
	relativePath: string;
	line: number;
	text: string;
};

type CoreLayeringAllowlistEntry = {
	from: string;
	to: string;
	issue: string;
};

type CoreLayer = {
	name: string;
	order: number;
};

type CoreImportEdge = {
	from: string;
	to: string;
	line: number;
	text: string;
	fromLayer: CoreLayer;
	toLayer: CoreLayer;
};

const coreSourceRoot = 'packages/core/src';
const coreLayeringAllowlistPath = 'scripts/core-layering-allowlist.json';

const coreLayers = new Map<string, CoreLayer>([
	['foundation', { name: 'Foundation', order: 0 }],
	['contracts', { name: 'Contracts', order: 1 }],
	['build', { name: 'Build', order: 2 }],
	['rendering', { name: 'Rendering', order: 3 }],
	['development', { name: 'Development and HMR', order: 4 }],
	['assembly', { name: 'Application assembly', order: 5 }],
]);

const coreFolderLayers = new Map<string, string>([
	['types', 'foundation'],
	['errors', 'foundation'],
	['global', 'foundation'],
	['utils', 'foundation'],
	['html', 'foundation'],
	['client', 'foundation'],
	['islands', 'foundation'],
	['validation', 'foundation'],
	['plugins', 'contracts'],
	['eco', 'contracts'],
	['build', 'build'],
	['assets', 'build'],
	['cache', 'build'],
	['diagnostics', 'build'],
	['router', 'rendering'],
	['route-renderer', 'rendering'],
	['html-pages', 'rendering'],
	['page-cache', 'rendering'],
	['static-site-generator', 'rendering'],
	['dev', 'development'],
	['dev-toolbar', 'development'],
	['hmr', 'development'],
	['watchers', 'development'],
	['adapters', 'assembly'],
	['config', 'assembly'],
]);

const coreRootFileLayers = new Map<string, string>([
	['constants.ts', 'foundation'],
	['declarations.d.ts', 'foundation'],
	['css-imports.d.ts', 'foundation'],
	['env.d.ts', 'foundation'],
	['env.ts', 'foundation'],
	['browser-env.ts', 'foundation'],
	['integration.ts', 'assembly'],
	['processor.ts', 'assembly'],
	['build.ts', 'assembly'],
	['client.ts', 'assembly'],
	['index.ts', 'assembly'],
	['index.browser.ts', 'assembly'],
]);

/**
 * Recursively lists source files under a directory while skipping generated and vendor folders.
 */
async function listFiles(dirPath: string): Promise<string[]> {
	const entries = await readdir(dirPath, { withFileTypes: true });
	const files = await Promise.all(
		entries.map(async (entry) => {
			const fullPath = path.join(dirPath, entry.name);
			if (entry.isDirectory()) {
				if (
					entry.name === 'node_modules' ||
					entry.name === '.git' ||
					entry.name === 'dist' ||
					entry.name === '.eco' ||
					entry.name === '.agents'
				) {
					return [];
				}

				return listFiles(fullPath);
			}

			return sourceExtensions.has(path.extname(entry.name)) ? [fullPath] : [];
		}),
	);

	return files.flat();
}

/**
 * Returns every 1-based line number whose source text matches the provided pattern.
 * Comment-only lines are ignored so documentation examples do not fail the guardrail.
 */
function findMatchingLines(pattern: RegExp, content: string): number[] {
	const matches: number[] = [];
	const lines = content.split('\n');

	for (const [index, line] of lines.entries()) {
		const trimmed = line.trim();
		if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
			continue;
		}

		pattern.lastIndex = 0;
		if (pattern.test(line)) {
			matches.push(index + 1);
		}
	}

	return matches;
}

function coreLayerForPath(relativePath: string): CoreLayer | undefined {
	const sourcePath = path.posix.relative(coreSourceRoot, relativePath);
	const folder = sourcePath.split('/')[0];
	const layerName = sourcePath.includes('/') ? coreFolderLayers.get(folder) : coreRootFileLayers.get(folder);
	return layerName ? coreLayers.get(layerName) : undefined;
}

function shouldSkipCoreLayering(relativePath: string): boolean {
	const sourcePath = path.posix.relative(`${coreSourceRoot}/`, relativePath);
	return (
		/(?:^|\/)(?:test|tests|__tests__|__fixtures__)(?:\/|$)/.test(sourcePath) ||
		/(?:^|\.)(?:test|tests|spec)(?:[.-][^.]+)*\.[cm]?[jt]sx?$/.test(path.posix.basename(sourcePath))
	);
}

function valueImportDeclarationSpecifier(node: ts.ImportDeclaration): string | undefined {
	return node.importClause?.isTypeOnly ? undefined : node.moduleSpecifier.text;
}

function valueExportDeclarationSpecifier(node: ts.ExportDeclaration): string | undefined {
	if (node.isTypeOnly || !node.moduleSpecifier || !ts.isStringLiteral(node.moduleSpecifier)) {
		return undefined;
	}

	return node.moduleSpecifier.text;
}

function valueImportEqualsSpecifier(node: ts.ImportEqualsDeclaration): string | undefined {
	const reference = node.moduleReference;
	if (node.isTypeOnly || !ts.isExternalModuleReference(reference) || !ts.isStringLiteral(reference.expression)) {
		return undefined;
	}

	return reference.expression.text;
}

type CoreModuleReference = {
	specifier: string;
	containingFile?: string;
};

function isImportMetaResolve(expression: ts.Expression): boolean {
	return (
		ts.isPropertyAccessExpression(expression) &&
		expression.name.text === 'resolve' &&
		ts.isMetaProperty(expression.expression) &&
		expression.expression.keywordToken === ts.SyntaxKind.ImportKeyword &&
		expression.expression.name.text === 'meta'
	);
}

function isRequireResolve(expression: ts.Expression): boolean {
	return (
		ts.isPropertyAccessExpression(expression) &&
		expression.name.text === 'resolve' &&
		ts.isIdentifier(expression.expression) &&
		expression.expression.text === 'require'
	);
}

function staticStringArgument(node: ts.CallExpression, index: number): string | undefined {
	const argument = node.arguments[index];
	return argument && ts.isStringLiteralLike(argument) ? argument.text : undefined;
}

function importMetaResolveReference(node: ts.CallExpression, specifier: string): CoreModuleReference | undefined {
	if (node.arguments.length === 1) return { specifier };
	const parentUrl = staticStringArgument(node, 1);
	if (!parentUrl) return undefined;

	try {
		const url = new URL(parentUrl);
		if (url.protocol !== 'file:') return undefined;
		return { specifier, containingFile: fileURLToPath(url) };
	} catch {
		return undefined;
	}
}

function valueCallModuleReference(node: ts.CallExpression): CoreModuleReference | undefined {
	const specifier = staticStringArgument(node, 0);
	if (!specifier) return undefined;
	if (isImportMetaResolve(node.expression)) return importMetaResolveReference(node, specifier);
	if (isRequireResolve(node.expression)) {
		return node.arguments.length === 1 ? { specifier } : undefined;
	}
	if (
		node.expression.kind === ts.SyntaxKind.ImportKeyword ||
		(ts.isIdentifier(node.expression) && node.expression.text === 'require')
	) {
		return { specifier };
	}
	return undefined;
}

function valueImportModuleReference(node: ts.Node): CoreModuleReference | undefined {
	if (ts.isCallExpression(node)) return valueCallModuleReference(node);
	let specifier: string | undefined;
	if (ts.isImportDeclaration(node)) specifier = valueImportDeclarationSpecifier(node);
	if (ts.isExportDeclaration(node)) specifier = valueExportDeclarationSpecifier(node);
	if (ts.isImportEqualsDeclaration(node)) specifier = valueImportEqualsSpecifier(node);
	if (specifier) return { specifier };
	return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCoreLayeringAllowlistEntry(value: unknown): value is CoreLayeringAllowlistEntry {
	return (
		isRecord(value) &&
		typeof value.from === 'string' &&
		typeof value.to === 'string' &&
		typeof value.issue === 'string' &&
		/^#\d+$/.test(value.issue)
	);
}

export async function checkCoreLayering(repositoryRoot = rootDir): Promise<Violation[]> {
	const violations: Violation[] = [];
	const sourceFiles = (await listFiles(path.join(repositoryRoot, coreSourceRoot)))
		.filter(
			(filePath) => !shouldSkipCoreLayering(path.relative(repositoryRoot, filePath).replaceAll(path.sep, '/')),
		)
		.map((filePath) => path.resolve(filePath));
	const sourceFileSet = new Set(sourceFiles);
	const upwardEdges = new Map<string, CoreImportEdge>();

	for (const filePath of sourceFiles) {
		const relativePath = path.relative(repositoryRoot, filePath).replaceAll(path.sep, '/');
		const fromLayer = coreLayerForPath(relativePath);
		if (!fromLayer) {
			violations.push({
				checkId: 'core-layering',
				message: 'Add this source folder or root file to the documented core layer map.',
				relativePath,
				line: 1,
				text: '',
			});
			continue;
		}

		const content = await readFile(filePath, 'utf8');
		const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);
		const visit = (node: ts.Node): void => {
			const moduleReference = valueImportModuleReference(node);
			if (moduleReference) {
				const resolved = ts.resolveModuleName(
					moduleReference.specifier,
					moduleReference.containingFile ?? filePath,
					{
						allowImportingTsExtensions: true,
						module: ts.ModuleKind.ESNext,
						moduleResolution: ts.ModuleResolutionKind.Bundler,
					},
					ts.sys,
				).resolvedModule?.resolvedFileName;
				const targetPath = resolved ? path.resolve(resolved) : undefined;
				if (targetPath && sourceFileSet.has(targetPath)) {
					const to = path.relative(repositoryRoot, targetPath).replaceAll(path.sep, '/');
					const toLayer = coreLayerForPath(to);
					if (!toLayer) {
						violations.push({
							checkId: 'core-layering',
							message: 'Add this source folder or root file to the documented core layer map.',
							relativePath: to,
							line: 1,
							text: '',
						});
					} else if (fromLayer.order < toLayer.order) {
						const edgeKey = `${relativePath} -> ${to}`;
						const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
						upwardEdges.set(edgeKey, {
							from: relativePath,
							to,
							line: line + 1,
							text: content.split('\n')[line]?.trim() ?? '',
							fromLayer,
							toLayer,
						});
					}
				}
			}

			ts.forEachChild(node, visit);
		};
		visit(sourceFile);
	}

	const allowlistContent = await readFile(path.join(repositoryRoot, coreLayeringAllowlistPath), 'utf8');
	const parsedAllowlist: unknown = JSON.parse(allowlistContent);
	if (!Array.isArray(parsedAllowlist)) {
		return [
			...violations,
			{
				checkId: 'core-layering',
				message: 'The core layering allowlist must be an array of { from, to, issue } entries.',
				relativePath: coreLayeringAllowlistPath,
				line: 1,
				text: '',
			},
		];
	}

	const allowedEdges = new Map<string, { entry: CoreLayeringAllowlistEntry; line: number }>();
	for (const [index, value] of parsedAllowlist.entries()) {
		if (!isCoreLayeringAllowlistEntry(value)) {
			violations.push({
				checkId: 'core-layering',
				message: 'Each allowlist entry needs source and target paths plus the issue that removes the edge.',
				relativePath: coreLayeringAllowlistPath,
				line: index + 1,
				text: JSON.stringify(value),
			});
			continue;
		}

		const edgeKey = `${value.from} -> ${value.to}`;
		if (allowedEdges.has(edgeKey)) {
			violations.push({
				checkId: 'core-layering',
				message: `Duplicate allowlist entry for ${edgeKey}.`,
				relativePath: coreLayeringAllowlistPath,
				line: index + 1,
				text: edgeKey,
			});
			continue;
		}

		allowedEdges.set(edgeKey, { entry: value, line: index + 1 });
	}

	for (const [edgeKey, edge] of upwardEdges) {
		if (allowedEdges.has(edgeKey)) {
			continue;
		}

		violations.push({
			checkId: 'core-layering',
			message: `${edge.fromLayer.name} source cannot import from the higher ${edge.toLayer.name} layer without a tracked exception.`,
			relativePath: edge.from,
			line: edge.line,
			text: edge.text,
		});
	}

	for (const [edgeKey, allowed] of allowedEdges) {
		if (!upwardEdges.has(edgeKey)) {
			violations.push({
				checkId: 'core-layering',
				message: `Stale allowlist entry; remove it after resolving the edge tracked by ${allowed.entry.issue}.`,
				relativePath: coreLayeringAllowlistPath,
				line: allowed.line,
				text: edgeKey,
			});
		}
	}

	return violations;
}

function getModuleSpecifier(node: ts.Node): string | undefined {
	if (
		(ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
		node.moduleSpecifier &&
		ts.isStringLiteral(node.moduleSpecifier)
	) {
		return node.moduleSpecifier.text;
	}
	if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) {
		return node.argument.literal.text;
	}
	return undefined;
}

/**
 * Verifies that core's shared type contracts import only sibling type modules or packages.
 */
export async function checkCoreTypesLeaf(repositoryRoot = rootDir): Promise<Violation[]> {
	const violations: Violation[] = [];
	const typeRoot = path.resolve(repositoryRoot, coreSourceRoot, 'types');
	const files = await listFiles(typeRoot);
	for (const filePath of files) {
		const content = await readFile(filePath, 'utf8');
		const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);
		const visit = (node: ts.Node): void => {
			const specifier = getModuleSpecifier(node);
			if (specifier) {
				const resolved = ts.resolveModuleName(
					specifier,
					filePath,
					{
						allowImportingTsExtensions: true,
						module: ts.ModuleKind.ESNext,
						moduleResolution: ts.ModuleResolutionKind.Bundler,
					},
					ts.sys,
				).resolvedModule?.resolvedFileName;
				if (
					resolved &&
					path.resolve(resolved).startsWith(`${path.resolve(repositoryRoot, coreSourceRoot)}${path.sep}`)
				) {
					const relativeToTypes = path.relative(typeRoot, path.resolve(resolved));
					if (relativeToTypes.startsWith('..') || path.isAbsolute(relativeToTypes)) {
						const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
						violations.push({
							checkId: 'core-types-leaf',
							message: 'Core type contracts may import other type contracts, not implementation modules.',
							relativePath: path.relative(repositoryRoot, filePath).replaceAll(path.sep, '/'),
							line: line + 1,
							text: content.split('\n')[line]?.trim() ?? '',
						});
					}
				}
			}

			ts.forEachChild(node, visit);
		};
		visit(sourceFile);
	}

	return violations;
}

/**
 * Portability checks that enforce the current runtime-neutral authoring policy.
 */
const checks: Check[] = [
	{
		id: 'package-bun-fs',
		roots: ['packages'],
		message: 'Direct Bun filesystem APIs are not allowed in Ecopages packages outside @ecopages/file-system.',
		shouldSkip: (relativePath) =>
			relativePath.startsWith('packages/file-system/src/') ||
			relativePath.includes('/test/') ||
			relativePath.includes('.test.'),
		match: (relativePath, content) =>
			relativePath.startsWith('packages/') ? findMatchingLines(/\bBun\.(write|file)\b/, content) : [],
	},
	{
		id: 'app-runtime-subpaths',
		roots: ['apps', 'templates', 'playground', 'e2e'],
		message:
			'Apps, templates, playgrounds, and fixtures should use the root @ecopages/core exports instead of runtime subpaths.',
		match: (_relativePath, content) => findMatchingLines(/@ecopages\/core\/(bun|node)(?:\/[^'"\s]+)?/, content),
	},
	{
		id: 'test-process-env-write',
		roots: ['packages', 'apps', 'templates', 'playground', 'e2e', 'scripts'],
		message:
			'Tests must change environment variables with vi.stubEnv: Vitest restores them (unstubEnvs), so a failing test cannot leak them into the next one.',
		shouldSkip: (relativePath) => !/\.test\./.test(path.posix.basename(relativePath)),
		match: (_relativePath, content) =>
			findMatchingLines(/process\.env(\.\w+|\[[^\]]+\])\s*=(?!=)|delete process\.env/, content),
	},
];

/**
 * Runs every portability check and reports actionable violations.
 */
async function main(): Promise<void> {
	const violations: Violation[] = [];

	for (const check of checks) {
		for (const root of check.roots) {
			const absoluteRoot = path.join(rootDir, root);
			const files = await listFiles(absoluteRoot);

			for (const filePath of files) {
				const relativePath = path.relative(rootDir, filePath).replaceAll(path.sep, '/');
				if (check.shouldSkip?.(relativePath)) {
					continue;
				}

				const content = await readFile(filePath, 'utf8');
				const lines = content.split('\n');
				for (const line of check.match(relativePath, content)) {
					violations.push({
						checkId: check.id,
						message: check.message,
						relativePath,
						line,
						text: lines[line - 1]?.trim() ?? '',
					});
				}
			}
		}
	}
	violations.push(...(await checkCoreLayering()));
	violations.push(...(await checkCoreTypesLeaf()));

	if (violations.length === 0) {
		console.log('Portability checks passed');
		return;
	}

	console.error('Portability checks failed:\n');
	for (const violation of violations) {
		console.error(`- [${violation.checkId}] ${violation.relativePath}:${violation.line}`);
		console.error(`  ${violation.message}`);
		if (violation.text) {
			console.error(`  ${violation.text}`);
		}
	}

	process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	await main();
}
