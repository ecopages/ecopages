import type {
	DependencyLazyTrigger,
	EcoComponent,
	LazyTriggerRule,
	ResolvedLazyTrigger,
} from '../../types/public-types.ts';
import { rapidhash } from '../../utils/hash.ts';

/**
 * Lazy scripts already normalized onto one trigger and concrete script URL set.
 */
export type ResolvedLazyGroup = {
	lazy: DependencyLazyTrigger;
	scripts: string[];
};

/**
 * Creates a stable grouping key for a lazy trigger declaration.
 */
export function getLazyTriggerKey(lazy: DependencyLazyTrigger): string {
	if ('on:idle' in lazy) {
		return 'on:idle';
	}

	if ('on:interaction' in lazy) {
		return `on:interaction:${lazy['on:interaction']}`;
	}

	if ('on:visible' in lazy) {
		const value = lazy['on:visible'];
		return `on:visible:${value === true ? 'true' : value}`;
	}

	return JSON.stringify(lazy);
}

/**
 * Derives the public lazy-trigger manifest attached to a component config.
 *
 * The generated `triggerId` is stable for the same component file and set of
 * resolved script URLs, independent of declaration order.
 */
export function buildResolvedLazyTriggers(
	config: NonNullable<EcoComponent['config']>,
	groups: ResolvedLazyGroup[],
): ResolvedLazyTrigger[] {
	if (groups.length === 0) return [];

	const componentFile = config.__eco?.file ?? '';
	const sortedUrls = groups
		.flatMap((group) => group.scripts)
		.sort()
		.join(',');
	const triggerId = `eco-trigger-${rapidhash(`${componentFile}:${sortedUrls}`).toString(16)}`;

	const rules: LazyTriggerRule[] = groups.map((group) => {
		const { scripts, lazy } = group;

		if ('on:idle' in lazy) {
			return { 'on:idle': { scripts } };
		}
		if ('on:interaction' in lazy) {
			return { 'on:interaction': { value: lazy['on:interaction'], scripts } };
		}
		if ('on:visible' in lazy) {
			const visibleSelector = lazy['on:visible'];
			if (visibleSelector === true) return { 'on:visible': { scripts } };
			return { 'on:visible': { value: String(visibleSelector), scripts } };
		}
		throw new Error(`Unknown lazy trigger kind: ${JSON.stringify(lazy)}`);
	});

	return [{ triggerId, rules }];
}
