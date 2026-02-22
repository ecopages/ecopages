import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import type { EcoBuildPlugin } from '@ecopages/core/build/build-types';

const SOURCE_FILE_FILTER = /\.(tsx?|jsx?)$/;
const STATIC_IMPORT_WITH_FROM_PATTERN = /^\s*import\s+[\s\S]*?\s+from\s+(['"])([^'"\n]+)\1\s*;?\s*$/gm;
const STATIC_SIDE_EFFECT_IMPORT_PATTERN = /^\s*import\s+(['"])([^'"\n]+)\1\s*;?\s*$/gm;
const EXPORT_FROM_PATTERN = /^\s*export\s+[\s\S]*?\s+from\s+(['"])([^'"\n]+)\1\s*;?\s*$/gm;
const DYNAMIC_IMPORT_PATTERN = /\bimport\(\s*(['"])([^'"\n]+)\1\s*\)/g;
const REQUIRE_PATTERN = /\brequire\(\s*(['"])([^'"\n]+)\1\s*\)/g;
const MODULE_DECLARATION_ARRAY_PATTERN = /\bmodules\s*:\s*\[([\s\S]*?)\]/g;
const STRING_LITERAL_PATTERN = /(['"])([^'"\n]+)\1/g;

type ClientGraphBoundaryOptions = {
	absWorkingDir?: string;
	declaredModules?: string[];
	alwaysAllowSpecifiers?: string[];
};

function isBareSpecifier(specifier: string): boolean {
	if (specifier.startsWith('.')) return false;
	if (specifier.startsWith('/')) return false;
	if (specifier.includes('://')) return false;
	return true;
}

function isProjectAliasSpecifier(specifier: string): boolean {
	return specifier.startsWith('@/') || specifier.startsWith('~/');
}

function toModuleBaseSpecifier(specifier: string): string {
	if (!isBareSpecifier(specifier) || specifier.startsWith('node:')) {
		return specifier;
	}

	if (specifier.startsWith('@')) {
		const [scope, name] = specifier.split('/');
		if (!scope || !name) return specifier;
		return `${scope}/${name}`;
	}

	const [name] = specifier.split('/');
	return name ?? specifier;
}

function extractLocalDeclaredModules(source: string): string[] {
	const declarations: string[] = [];

	for (const match of source.matchAll(MODULE_DECLARATION_ARRAY_PATTERN)) {
		const arraySource = match[1] ?? '';
		for (const value of arraySource.matchAll(STRING_LITERAL_PATTERN)) {
			const declaration = value[2]?.trim();
			if (declaration) {
				declarations.push(declaration);
			}
		}
	}

	return declarations;
}

function parseDeclaredModuleSource(value: string): string | undefined {
	const source = value.trim();
	if (source.length === 0) return undefined;
	const openBraceIndex = source.indexOf('{');
	if (openBraceIndex < 0) return source;
	const from = source.slice(0, openBraceIndex).trim();
	return from.length > 0 ? from : undefined;
}

function toAllowedModuleSources(moduleDeclarations: string[] | undefined): Set<string> {
	const normalized = new Set<string>();
	for (const declaration of moduleDeclarations ?? []) {
		const from = parseDeclaredModuleSource(declaration);
		if (from) {
			normalized.add(from);
		}
	}
	return normalized;
}

function shouldStripSpecifier(specifier: string, allowedModuleSources: Set<string>): boolean {
	if (specifier.startsWith('node:')) {
		return true;
	}

	if (isProjectAliasSpecifier(specifier)) {
		return false;
	}

	if (!isBareSpecifier(specifier)) {
		return false;
	}

	const moduleBase = toModuleBaseSpecifier(specifier);
	return !allowedModuleSources.has(moduleBase);
}

function stripForbiddenImports(source: string, allowedModuleSources: Set<string>): string {
	let transformed = source;

	transformed = transformed.replace(STATIC_IMPORT_WITH_FROM_PATTERN, (full, _quote, specifier: string) => {
		return shouldStripSpecifier(specifier, allowedModuleSources) ? '' : full;
	});

	transformed = transformed.replace(STATIC_SIDE_EFFECT_IMPORT_PATTERN, (full, _quote, specifier: string) => {
		return shouldStripSpecifier(specifier, allowedModuleSources) ? '' : full;
	});

	transformed = transformed.replace(EXPORT_FROM_PATTERN, (full, _quote, specifier: string) => {
		return shouldStripSpecifier(specifier, allowedModuleSources) ? '' : full;
	});

	transformed = transformed.replace(DYNAMIC_IMPORT_PATTERN, (full, _quote, specifier: string) => {
		return shouldStripSpecifier(specifier, allowedModuleSources) ? 'Promise.resolve({})' : full;
	});

	transformed = transformed.replace(REQUIRE_PATTERN, (full, _quote, specifier: string) => {
		return shouldStripSpecifier(specifier, allowedModuleSources) ? '({})' : full;
	});

	return transformed;
}

export function createClientGraphBoundaryPlugin(options?: ClientGraphBoundaryOptions): EcoBuildPlugin {
	return {
		name: 'ecopages-client-graph-boundary',
		setup(build) {
			const absWorkingDir = options?.absWorkingDir ?? process.cwd();
			const globallyDeclaredSources = toAllowedModuleSources(options?.declaredModules);
			for (const alwaysAllow of options?.alwaysAllowSpecifiers ?? []) {
				globallyDeclaredSources.add(toModuleBaseSpecifier(alwaysAllow));
			}

			/**
			 * Source-level transform: replace static `fs.readFileSync(path.resolve('./...'), 'utf-8')`
			 * calls with the actual file content inlined as a string literal at build time.
			 *
			 * This prevents server/client hydration mismatches when components read files at module
			 * scope — the browser bundle will contain the same content the server rendered, so React
			 * never needs to enter client-render recovery mode.
			 */
			build.onLoad({ filter: SOURCE_FILE_FILTER }, (args) => {
				let source: string;
				try {
					source = readFileSync(args.path, 'utf-8');
				} catch {
					return undefined;
				}

				let transformed = source;
				let modified = false;

				if (source.includes('readFileSync')) {
					const readFileTransformed = transformed.replace(
					/\bfs\.readFileSync\s*\(\s*path\.resolve\s*\(\s*(['"`])([^'"`\n]+)\1\s*\)\s*,\s*['"`]utf-?8['"`]\s*\)/g,
					(_match, _q, relPath) => {
						modified = true;
						try {
							const sourceDir = dirname(args.path);
							const srcDirIndex = args.path.lastIndexOf('/src/');
							const inferredProjectRoot = srcDirIndex >= 0 ? args.path.slice(0, srcDirIndex) : undefined;
							const candidates = [
								resolve(absWorkingDir, relPath),
								resolve(process.cwd(), relPath),
								resolve(sourceDir, relPath),
								...(inferredProjectRoot ? [resolve(inferredProjectRoot, relPath)] : []),
							];

							const absolutePath = candidates.find((candidate) => existsSync(candidate));
							if (!absolutePath) return '""';

							const content = readFileSync(absolutePath, 'utf-8');
							return JSON.stringify(content);
						} catch {
							return '""';
						}
					},
				);
					transformed = readFileTransformed;
				}

				const localDeclaredSources = toAllowedModuleSources(extractLocalDeclaredModules(source));
				const allowedModuleSources = new Set<string>([...globallyDeclaredSources, ...localDeclaredSources]);
				const strippedImports = stripForbiddenImports(transformed, allowedModuleSources);
				if (strippedImports !== transformed) {
					modified = true;
					transformed = strippedImports;
				}

				if (!modified) return undefined;

				const ext = extname(args.path).slice(1) as 'ts' | 'tsx' | 'js' | 'jsx';
				return { contents: transformed, loader: ext };
			});
		},
	};
}
