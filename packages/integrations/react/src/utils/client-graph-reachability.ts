/**
 * Specifier classification and requested-export registry helpers for the client graph boundary.
 */

import { dirname, resolve } from 'node:path';
import type { RequestedExportRules } from './client-graph-boundary-cache.ts';

export function isBareSpecifier(specifier: string): boolean {
	if (specifier.startsWith('.')) return false;
	if (specifier.startsWith('/')) return false;
	if (specifier.includes('://')) return false;
	return true;
}

export function isProjectAliasSpecifier(specifier: string): boolean {
	return specifier.startsWith('@/') || specifier.startsWith('~/') || specifier.startsWith('ecopages:');
}

/**
 * Determines whether a specifier should be treated as server-only.
 *
 * This covers Node built-ins as well as local module conventions such as
 * `.server.ts` and extensionless imports that resolve to `.server.*` files.
 *
 * @param specifier - Raw import specifier from the module source.
 * @returns True when the import must never become client-reachable.
 */
export function isServerOnlySpecifier(specifier: string): boolean {
	if (specifier.startsWith('node:')) return true;
	return /(?:^|[/])[^/]+\.server(?:$|\.)/.test(specifier);
}

/**
 * Strips down a deep path module specifier to its foundational root package name.
 *
 * When checking against the "allowed modules" whitelist, a component might import something deeply
 * nested like `lodash/fp/map` or `@myorg/ui/button`. However, the user configuration only whitelists
 * the root `lodash` or `@myorg/ui` package. This normalizer ensures we are comparing apples to apples
 * by extracting the base package scope before checking the authorization list.
 *
 * @example
 * toModuleBaseSpecifier('@scope/package/deep/file') -> '@scope/package'
 * toModuleBaseSpecifier('lodash/cloneDeep') -> 'lodash'
 * toModuleBaseSpecifier('node:fs') -> 'node:fs'
 *
 * @param specifier - The raw import specifier from the code.
 * @returns The root package name, preserving scoped npm organizations.
 */
export function toModuleBaseSpecifier(specifier: string): string {
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

/**
 * Parses the grammar syntax of declared modules.
 * Handles patterns like `@pkg/name` and `@pkg/name{namedImport,anotherImport}`
 * returning a map of base packages to their explicitly allowed specifiers.
 *
 * @param moduleDeclarations - A list of module declaration strings.
 * @returns A structured map of allowed packages and their named exports.
 */
export function parseDeclaredModules(
	moduleDeclarations: readonly string[] | undefined,
): Map<string, Set<string> | '*'> {
	const map = new Map<string, Set<string> | '*'>();
	for (const declaration of moduleDeclarations ?? []) {
		const source = declaration.trim();
		if (source.length === 0) continue;
		const openBraceIndex = source.indexOf('{');
		if (openBraceIndex < 0) {
			map.set(toModuleBaseSpecifier(source), '*');
			continue;
		}

		const closeBraceIndex = source.indexOf('}', openBraceIndex);
		const rawPkg = source.slice(0, openBraceIndex).trim();
		if (rawPkg.length === 0) continue;
		const pkg = toModuleBaseSpecifier(rawPkg);

		const namedImportsStr =
			closeBraceIndex > openBraceIndex
				? source.slice(openBraceIndex + 1, closeBraceIndex)
				: source.slice(openBraceIndex + 1);

		const namedImports = namedImportsStr
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean);

		const existing = map.get(pkg);
		if (existing === '*') continue;

		if (!existing) {
			if (namedImports.length === 0) {
				map.set(pkg, '*');
			} else {
				map.set(pkg, new Set(namedImports));
			}
		} else {
			for (const name of namedImports) {
				existing.add(name);
			}
		}
	}
	return map;
}

/**
 * Merges two declared module maps, combining their allowable specific scopes.
 *
 * @param a - First map of declared modules.
 * @param b - Second map of declared modules to merge into the first.
 * @returns A unified map of both declarations.
 */
export function mergeDeclaredModulesMap(
	a: Map<string, Set<string> | '*'>,
	b: Map<string, Set<string> | '*'>,
): Map<string, Set<string> | '*'> {
	const result = new Map(a);
	for (const [pkg, imports] of b.entries()) {
		const existing = result.get(pkg);
		if (existing === '*') continue;
		if (imports === '*') {
			result.set(pkg, '*');
			continue;
		}
		if (!existing) {
			result.set(pkg, imports);
		} else {
			for (const name of imports) {
				existing.add(name);
			}
		}
	}
	return result;
}

export function normalizeRequestedExportsKey(pathname: string): string {
	let normalized = pathname.replace(/\\/g, '/');
	normalized = normalized.replace(/\.(tsx?|jsx?)$/i, '');
	if (normalized.endsWith('/index')) {
		normalized = normalized.slice(0, -'/index'.length);
	}
	return normalized;
}

/**
 * Resolves a local import specifier into a requested-export registry key.
 *
 * Bare package specifiers and project aliases are intentionally ignored because
 * requested-export propagation is only used for cross-file local reachability.
 *
 * @param importer - Absolute path of the importing module.
 * @param specifier - Raw import or re-export specifier.
 * @returns Registry key for a local dependency, or `undefined` when not applicable.
 */
export function resolveRequestedExportsKey(importer: string, specifier: string): string | undefined {
	if (isBareSpecifier(specifier) || isProjectAliasSpecifier(specifier)) {
		return undefined;
	}

	const resolved = specifier.startsWith('/') ? specifier : resolve(dirname(importer), specifier);
	return normalizeRequestedExportsKey(resolved);
}

/**
 * Merges newly discovered requested-export rules into the local propagation registry.
 *
 * Once a module is promoted to `'*'`, it stays fully reachable for the remainder
 * of the transform pass.
 *
 * @param registry - Cross-module requested-export registry.
 * @param moduleKey - Normalized local module key.
 * @param rules - Newly observed reachable export rules for the module.
 */
export function mergeRequestedExportRules(
	registry: Map<string, RequestedExportRules>,
	moduleKey: string,
	rules: Set<string> | '*',
) {
	const existing = registry.get(moduleKey);
	if (existing === '*') return;
	if (rules === '*') {
		registry.set(moduleKey, '*');
		return;
	}
	if (!existing) {
		registry.set(moduleKey, new Set(rules));
		return;
	}
	for (const rule of rules) {
		existing.add(rule);
	}
}

function cloneRequestedExportRules(rules: RequestedExportRules): RequestedExportRules {
	return rules === '*' ? rules : new Set(rules);
}

export function snapshotRegistry(registry: Map<string, RequestedExportRules>): Map<string, RequestedExportRules> {
	const out = new Map<string, RequestedExportRules>();
	for (const [key, rules] of registry) {
		out.set(key, cloneRequestedExportRules(rules));
	}
	return out;
}

export function diffRequestedExportRules(
	before: RequestedExportRules | undefined,
	after: RequestedExportRules,
): RequestedExportRules | undefined {
	if (!before) {
		return cloneRequestedExportRules(after);
	}

	if (before === '*') {
		return undefined;
	}

	if (after === '*') {
		return '*';
	}

	const addedRules = new Set<string>();
	for (const rule of after) {
		if (!before.has(rule)) {
			addedRules.add(rule);
		}
	}

	return addedRules.size > 0 ? addedRules : undefined;
}
