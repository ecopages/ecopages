export function normalizeSegmentPath(pathname: string): string {
	if (pathname.length > 1 && pathname.endsWith('/')) {
		return pathname.slice(0, -1);
	}
	return pathname;
}

type SegmentMatchState = {
	patternSegments: string[];
	pathSegments: string[];
	params: Record<string, string | string[]>;
	patternIndex: number;
	pathIndex: number;
};

function tryMatchCatchAllSegment(
	patternSegment: string,
	state: SegmentMatchState,
): Record<string, string | string[]> | null {
	if (!patternSegment.startsWith('[...') || !patternSegment.endsWith(']')) {
		return null;
	}

	const paramName = patternSegment.slice(4, -1);
	state.params[paramName] = state.pathSegments.slice(state.pathIndex);
	return state.params;
}

function tryMatchDynamicSegment(patternSegment: string, pathSegment: string, state: SegmentMatchState): boolean {
	if (patternSegment.startsWith(':')) {
		state.params[patternSegment.slice(1)] = pathSegment;
		state.patternIndex++;
		state.pathIndex++;
		return true;
	}

	if (patternSegment.startsWith('[') && patternSegment.endsWith(']')) {
		state.params[patternSegment.slice(1, -1)] = pathSegment;
		state.patternIndex++;
		state.pathIndex++;
		return true;
	}

	return false;
}

function matchTrailingCatchAll(state: SegmentMatchState): Record<string, string | string[]> | null {
	const remaining = state.patternSegments.slice(state.patternIndex);
	const catchAll = remaining[0];

	if (remaining.length !== 1 || (catchAll !== '*' && !(catchAll.startsWith('[...') && catchAll.endsWith(']')))) {
		return null;
	}

	if (catchAll.startsWith('[...')) {
		const paramName = catchAll.slice(4, -1);
		state.params[paramName] = [];
	}

	return state.params;
}

export function matchApiPathPattern(pattern: string, pathname: string): Record<string, string | string[]> | null {
	const normalizedPattern = normalizeSegmentPath(pattern);
	const normalizedPathname = normalizeSegmentPath(pathname);

	const state: SegmentMatchState = {
		patternSegments: normalizedPattern.split('/').filter(Boolean),
		pathSegments: normalizedPathname.split('/').filter(Boolean),
		params: {},
		patternIndex: 0,
		pathIndex: 0,
	};

	while (state.patternIndex < state.patternSegments.length && state.pathIndex < state.pathSegments.length) {
		const patternSegment = state.patternSegments[state.patternIndex];
		const pathSegment = state.pathSegments[state.pathIndex];

		if (patternSegment === '*') {
			return state.params;
		}

		const catchAllMatch = tryMatchCatchAllSegment(patternSegment, state);
		if (catchAllMatch) {
			return catchAllMatch;
		}

		if (tryMatchDynamicSegment(patternSegment, pathSegment, state)) {
			continue;
		}

		if (patternSegment !== pathSegment) {
			return null;
		}

		state.patternIndex++;
		state.pathIndex++;
	}

	if (state.patternIndex < state.patternSegments.length) {
		return matchTrailingCatchAll(state);
	}

	if (state.pathIndex < state.pathSegments.length) {
		return null;
	}

	return state.params;
}

export function scoreApiPathPattern(pattern: string): number {
	const segments = normalizeSegmentPath(pattern).split('/').filter(Boolean);
	let score = 0;
	for (const segment of segments) {
		if (segment === '*' || (segment.startsWith('[...') && segment.endsWith(']'))) {
			score += 10;
		} else if (segment.startsWith(':') || (segment.startsWith('[') && segment.endsWith(']'))) {
			score += 50;
		} else {
			score += 100;
		}
	}
	return score;
}

export function matchExplicitStaticPathPattern(pattern: string, pathname: string): Record<string, string> | null {
	const patternSegments = normalizeSegmentPath(pattern).split('/').filter(Boolean);
	const pathSegments = normalizeSegmentPath(pathname).split('/').filter(Boolean);

	if (patternSegments.length !== pathSegments.length) {
		const lastPattern = patternSegments[patternSegments.length - 1];
		const isCatchAll = lastPattern?.startsWith('[...') || lastPattern?.startsWith(':...');
		if (!isCatchAll) {
			return null;
		}
	}

	const params: Record<string, string> = {};

	for (let i = 0; i < patternSegments.length; i++) {
		const patternPart = patternSegments[i];
		const pathPart = pathSegments[i];

		if (patternPart.startsWith(':...') || patternPart.startsWith('[...')) {
			const paramName = patternPart.replace(/^(:\.\.\.|\[\.\.\.)/, '').replace(/\]$/, '');
			params[paramName] = pathSegments.slice(i).join('/');
			return params;
		}

		if (patternPart.startsWith(':')) {
			params[patternPart.slice(1)] = pathPart;
		} else if (patternPart.startsWith('[') && patternPart.endsWith(']')) {
			params[patternPart.slice(1, -1)] = pathPart;
		} else if (patternPart !== pathPart) {
			return null;
		}
	}

	return params;
}

export function matchColonSegmentPath(pattern: string, pathname: string): Record<string, string> | null {
	const patternSegments = pattern.split('/').filter(Boolean);
	const pathSegments = pathname.split('/').filter(Boolean);

	if (patternSegments.length !== pathSegments.length) {
		return null;
	}

	const params: Record<string, string> = {};

	for (let i = 0; i < patternSegments.length; i++) {
		const patternSegment = patternSegments[i];
		const pathSegment = pathSegments[i];

		if (!patternSegment || !pathSegment) {
			return null;
		}

		if (patternSegment.startsWith(':')) {
			const paramName = patternSegment.slice(1);
			if (!paramName) {
				return null;
			}
			params[paramName] = pathSegment;
		} else if (patternSegment !== pathSegment) {
			return null;
		}
	}

	return params;
}

export function scoreColonSegmentPath(pattern: string): number {
	const segments = pattern.split('/').filter(Boolean);
	let literals = 0;
	let dynamics = 0;
	for (const segment of segments) {
		if (segment.startsWith(':')) {
			dynamics += 1;
		} else {
			literals += 1;
		}
	}
	return literals * 100 - dynamics * 10 + segments.length;
}
