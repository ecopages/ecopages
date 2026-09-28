import type { InjectorMapConfig } from '@ecopages/scripts-injector/types';
import type { ResolvedLazyScriptGroup } from '../types/public-types.ts';

/**
 * Normalizes a comma-separated scripts string into absolute script URLs.
 *
 * @param scripts Comma-separated script paths.
 * @returns Normalized script path list.
 */
function normalizeScripts(scripts: string): string[] {
	return scripts
		.split(',')
		.map((scriptPath) => scriptPath.trim())
		.filter(Boolean)
		.map((scriptPath) => {
			if (scriptPath.startsWith('/')) {
				return scriptPath;
			}

			const normalizedRelativePath = scriptPath.replace(/^\/+/, '').replace(/^(\.\/)+/, '');
			return `/${normalizedRelativePath}`;
		});
}

/**
 * Deduplicates comma-separated values while preserving first-seen order.
 *
 * @param values CSV value list.
 * @returns A single normalized CSV string.
 */
function dedupeCsvValues(values: string[]): string {
	const seen = new Set<string>();

	for (const value of values) {
		for (const token of value
			.split(',')
			.map((part) => part.trim())
			.filter(Boolean)) {
			seen.add(token);
		}
	}

	return Array.from(seen).join(',');
}

function mergeInjectorScripts(map: InjectorMapConfig, key: keyof InjectorMapConfig, scripts: string[]): void {
	const entry = map[key];
	map[key] = {
		...entry,
		scripts: [...(entry?.scripts ?? []), ...scripts],
	};
}

function applyIdleLazyTrigger(map: InjectorMapConfig, scripts: string[]): void {
	mergeInjectorScripts(map, 'on:idle', scripts);
}

function applyInteractionLazyTrigger(
	map: InjectorMapConfig,
	lazy: Extract<ResolvedLazyScriptGroup['lazy'], { 'on:interaction': string }>,
	scripts: string[],
): void {
	const currentValue = map['on:interaction']?.value;
	const nextValue = lazy['on:interaction'];

	map['on:interaction'] = {
		value: typeof currentValue === 'string' ? dedupeCsvValues([currentValue, nextValue]) : nextValue,
		scripts: [...(map['on:interaction']?.scripts ?? []), ...scripts],
	};
}

function applyVisibleLazyTrigger(
	map: InjectorMapConfig,
	lazy: Extract<ResolvedLazyScriptGroup['lazy'], { 'on:visible': string | boolean }>,
	scripts: string[],
): void {
	const currentValue = map['on:visible']?.value;
	const currentThreshold = typeof currentValue === 'string' ? currentValue : undefined;
	const nextValue = lazy['on:visible'];

	map['on:visible'] = {
		...(nextValue === true ? (currentThreshold ? { value: currentThreshold } : {}) : { value: String(nextValue) }),
		scripts: [...(map['on:visible']?.scripts ?? []), ...scripts],
	};
}

function applyLazyGroupToInjectorMap(map: InjectorMapConfig, group: ResolvedLazyScriptGroup): void {
	const scripts = normalizeScripts(group.scripts);
	const lazy = group.lazy;

	if ('on:idle' in lazy) {
		applyIdleLazyTrigger(map, scripts);
		return;
	}

	if ('on:interaction' in lazy) {
		applyInteractionLazyTrigger(map, lazy, scripts);
		return;
	}

	if ('on:visible' in lazy) {
		applyVisibleLazyTrigger(map, lazy, scripts);
		return;
	}

	throw new Error(
		`Invalid lazy options: must specify on:idle, on:interaction, or on:visible. Received: ${JSON.stringify(lazy)}`,
	);
}

function dedupeInjectorMapScripts(map: InjectorMapConfig): void {
	for (const key of Object.keys(map)) {
		const scripts = map[key]?.scripts;
		if (scripts) {
			map[key] = {
				...map[key],
				scripts: Array.from(new Set(scripts)),
			};
		}
	}
}

/**
 * Builds a scripts-injector map config from resolved lazy script groups.
 *
 * @param lazyGroups Lazy script groups resolved during dependency processing.
 * @returns Injector map config keyed by lazy trigger.
 */
function buildInjectorMap(lazyGroups: readonly ResolvedLazyScriptGroup[]): InjectorMapConfig {
	const map: InjectorMapConfig = {};

	for (const group of lazyGroups) {
		applyLazyGroupToInjectorMap(map, group);
	}

	dedupeInjectorMapScripts(map);

	return map;
}

/**
 * Creates a safe JSON payload string for `<script type="ecopages/injector-map">`.
 *
 * @param lazyGroups Lazy script groups resolved during dependency processing.
 * @returns Escaped JSON string safe for inline script embedding.
 */
export function buildInjectorMapScript(lazyGroups: readonly ResolvedLazyScriptGroup[]): string {
	const map = buildInjectorMap(lazyGroups);
	return JSON.stringify(map).replace(/<\/script/gi, '<\\/script');
}
