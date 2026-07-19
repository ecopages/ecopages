export function normalizeSegmentPath(pathname: string): string {
	if (pathname.length > 1 && pathname.endsWith('/')) {
		return pathname.slice(0, -1);
	}
	return pathname;
}

export function matchApiPathPattern(pattern: string, pathname: string): Record<string, string | string[]> | null {
	const normalizedPattern = normalizeSegmentPath(pattern);
	const normalizedPathname = normalizeSegmentPath(pathname);

	const patternSegments = normalizedPattern.split('/').filter(Boolean);
	const pathSegments = normalizedPathname.split('/').filter(Boolean);
	const params: Record<string, string | string[]> = {};

	let patternIndex = 0;
	let pathIndex = 0;

	while (patternIndex < patternSegments.length && pathIndex < pathSegments.length) {
		const patternSegment = patternSegments[patternIndex];
		const pathSegment = pathSegments[pathIndex];

		if (patternSegment === '*') {
			return params;
		}

		if (patternSegment.startsWith('[...') && patternSegment.endsWith(']')) {
			const paramName = patternSegment.slice(4, -1);
			params[paramName] = pathSegments.slice(pathIndex);
			return params;
		}

		if (patternSegment.startsWith(':')) {
			params[patternSegment.slice(1)] = pathSegment;
			patternIndex++;
			pathIndex++;
			continue;
		}

		if (patternSegment.startsWith('[') && patternSegment.endsWith(']')) {
			params[patternSegment.slice(1, -1)] = pathSegment;
			patternIndex++;
			pathIndex++;
			continue;
		}

		if (patternSegment !== pathSegment) {
			return null;
		}

		patternIndex++;
		pathIndex++;
	}

	if (patternIndex < patternSegments.length) {
		const remaining = patternSegments.slice(patternIndex);
		const catchAll = remaining[0];

		if (remaining.length === 1 && (catchAll === '*' || (catchAll.startsWith('[...') && catchAll.endsWith(']')))) {
			if (catchAll.startsWith('[...')) {
				const paramName = catchAll.slice(4, -1);
				params[paramName] = [];
			}
			return params;
		}

		return null;
	}

	if (pathIndex < pathSegments.length) {
		return null;
	}

	return params;
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
