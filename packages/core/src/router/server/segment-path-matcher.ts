import { HttpError } from '../../errors/http-error.ts';
import { normalizePathname } from '../../utils/path-pattern.ts';
import type { PageParams } from '../../types/contracts.ts';

export type SegmentPathSyntax = 'filesystem' | 'api' | 'explicit' | 'websocket';
export type SegmentPathParams = PageParams;
export type ParsedSegmentPath = readonly string[];

type PatternSegment =
	| { kind: 'literal'; value: string }
	| { kind: 'parameter'; name: string }
	| { kind: 'catch-all'; name: string }
	| { kind: 'wildcard' };

type SegmentPathSyntaxOptions = {
	bracketParams: boolean;
	colonParams: boolean;
	bracketCatchAll: boolean;
	colonCatchAll: boolean;
	wildcard: boolean;
	catchAllValue: 'segments' | 'joined';
};

const syntaxOptions: Record<SegmentPathSyntax, SegmentPathSyntaxOptions> = {
	filesystem: {
		bracketParams: true,
		colonParams: false,
		bracketCatchAll: true,
		colonCatchAll: false,
		wildcard: false,
		catchAllValue: 'segments',
	},
	api: {
		bracketParams: true,
		colonParams: true,
		bracketCatchAll: true,
		colonCatchAll: false,
		wildcard: true,
		catchAllValue: 'segments',
	},
	explicit: {
		bracketParams: true,
		colonParams: true,
		bracketCatchAll: true,
		colonCatchAll: true,
		wildcard: false,
		catchAllValue: 'joined',
	},
	websocket: {
		bracketParams: false,
		colonParams: true,
		bracketCatchAll: false,
		colonCatchAll: false,
		wildcard: false,
		catchAllValue: 'joined',
	},
};

function extractName(segment: string, prefix: string, suffix: string): string | null {
	if (!segment.startsWith(prefix) || !segment.endsWith(suffix)) {
		return null;
	}

	const suffixEnd = suffix ? segment.length - suffix.length : segment.length;
	const name = segment.slice(prefix.length, suffixEnd);
	return name || null;
}

function parseCatchAllSegment(segment: string, options: SegmentPathSyntaxOptions): PatternSegment | null {
	const bracketName = options.bracketCatchAll ? extractName(segment, '[...', ']') : null;
	if (bracketName) return { kind: 'catch-all', name: bracketName };

	const colonName = options.colonCatchAll ? extractName(segment, ':...', '') : null;
	return colonName ? { kind: 'catch-all', name: colonName } : null;
}

function parseParameterSegment(segment: string, options: SegmentPathSyntaxOptions): PatternSegment | null {
	const bracketName = options.bracketParams ? extractName(segment, '[', ']') : null;
	if (bracketName) return { kind: 'parameter', name: bracketName };

	const colonName = options.colonParams ? extractName(segment, ':', '') : null;
	return colonName ? { kind: 'parameter', name: colonName } : null;
}

function parsePatternSegment(segment: string, options: SegmentPathSyntaxOptions): PatternSegment {
	if (options.wildcard && segment === '*') return { kind: 'wildcard' };

	const catchAll = parseCatchAllSegment(segment, options);
	if (catchAll) return catchAll;

	const parameter = parseParameterSegment(segment, options);
	if (parameter) return parameter;

	return { kind: 'literal', value: decodePatternLiteral(segment) };
}

function decodePatternLiteral(segment: string): string {
	try {
		return decodeURIComponent(segment);
	} catch {
		return segment;
	}
}

function parsePattern(pattern: string, syntax: SegmentPathSyntax): PatternSegment[] {
	const options = syntaxOptions[syntax];
	return normalizePathname(pattern)
		.split('/')
		.filter(Boolean)
		.map((segment) => parsePatternSegment(segment, options));
}

/**
 * Normalizes and decodes a request pathname once for matching multiple routes.
 *
 * @remarks
 * Splits before percent-decoding, so an encoded slash remains within its
 * original segment. Malformed escapes throw an HTTP 400 {@link HttpError}.
 */
export function parseSegmentPath(pathname: string): ParsedSegmentPath {
	return normalizePathname(pathname)
		.split('/')
		.filter(Boolean)
		.map((segment) => {
			try {
				return decodeURIComponent(segment);
			} catch {
				throw HttpError.BadRequest('Malformed percent-encoding in URL path');
			}
		});
}

export function matchParsedSegmentPath(
	pattern: string,
	pathSegments: ParsedSegmentPath,
	syntax: 'filesystem' | 'api',
): SegmentPathParams | null;
export function matchParsedSegmentPath(
	pattern: string,
	pathSegments: ParsedSegmentPath,
	syntax: 'explicit' | 'websocket',
): Record<string, string> | null;
export function matchParsedSegmentPath(
	pattern: string,
	pathSegments: ParsedSegmentPath,
	syntax: SegmentPathSyntax,
): SegmentPathParams | null;
export function matchParsedSegmentPath(
	pattern: string,
	pathSegments: ParsedSegmentPath,
	syntax: SegmentPathSyntax,
): SegmentPathParams | null {
	const patternSegments = parsePattern(pattern, syntax);
	const params: SegmentPathParams = {};
	const { catchAllValue } = syntaxOptions[syntax];

	for (const [index, patternSegment] of patternSegments.entries()) {
		if (patternSegment.kind === 'wildcard') {
			return params;
		}

		if (patternSegment.kind === 'catch-all') {
			const remainingSegments = pathSegments.slice(index);
			params[patternSegment.name] = catchAllValue === 'joined' ? remainingSegments.join('/') : remainingSegments;
			return params;
		}

		const pathSegment = pathSegments[index];
		if (pathSegment === undefined) {
			return null;
		}

		if (patternSegment.kind === 'parameter') {
			params[patternSegment.name] = pathSegment;
			continue;
		}

		if (patternSegment.value !== pathSegment) {
			return null;
		}
	}

	return pathSegments.length === patternSegments.length ? params : null;
}

/**
 * Matches one route syntax against a pathname and returns its captured parameters.
 *
 * @remarks
 * The pathname is split before percent-decoding, so an encoded slash remains
 * within its original segment. Malformed escapes throw an HTTP 400 {@link HttpError}.
 */
export function matchSegmentPath(
	pattern: string,
	pathname: string,
	syntax: 'filesystem' | 'api',
): SegmentPathParams | null;
export function matchSegmentPath(
	pattern: string,
	pathname: string,
	syntax: 'explicit' | 'websocket',
): Record<string, string> | null;
export function matchSegmentPath(
	pattern: string,
	pathname: string,
	syntax: SegmentPathSyntax,
): SegmentPathParams | null;
export function matchSegmentPath(
	pattern: string,
	pathname: string,
	syntax: SegmentPathSyntax,
): SegmentPathParams | null {
	return matchParsedSegmentPath(pattern, parseSegmentPath(pathname), syntax);
}

/**
 * Builds a concrete pathname from a route pattern and its params.
 *
 * @remarks
 * The inverse of {@link matchSegmentPath}: it reads the pattern with the same
 * segment grammar, so `:id` never touches `:idx`, and a catch-all segment
 * (`[...name]` or, for explicit routes, `:...name`) expands to every value of
 * an array param or to a joined string. Values are inserted as given, without
 * percent-encoding. A segment whose param is missing is kept verbatim, and a
 * catch-all with no values disappears from the pathname.
 */
export function buildSegmentPath(pattern: string, params: SegmentPathParams, syntax: SegmentPathSyntax): string {
	const options = syntaxOptions[syntax];
	const segments = normalizePathname(pattern)
		.split('/')
		.filter(Boolean)
		.flatMap((segment) => {
			const patternSegment = parsePatternSegment(segment, options);
			if (patternSegment.kind !== 'parameter' && patternSegment.kind !== 'catch-all') {
				return [segment];
			}

			const value = params[patternSegment.name];
			if (value === undefined) {
				return [segment];
			}

			return Array.isArray(value) ? value : [value];
		})
		.filter((segment) => segment !== '');

	return normalizePathname(segments.join('/'));
}

/**
 * Returns a key that two patterns share when they match the same pathnames.
 *
 * @remarks
 * Parameter names and syntax are dropped, so `/blog/:slug` and `/blog/[id]` share a key, and a
 * catch-all shares one with a wildcard, since both take every remaining segment.
 */
export function segmentPathPatternKey(pattern: string, syntax: SegmentPathSyntax): string {
	const segments = parsePattern(pattern, syntax).map((segment) => {
		if (segment.kind === 'literal') return encodeURIComponent(segment.value);
		return segment.kind === 'parameter' ? '[]' : '[...]';
	});
	return `/${segments.join('/')}`;
}

export function scoreSegmentPathPattern(pattern: string, syntax: 'api'): number;
export function scoreSegmentPathPattern(pattern: string, syntax: 'websocket'): number;
export function scoreSegmentPathPattern(pattern: string, syntax: 'api' | 'websocket'): number {
	const segments = parsePattern(pattern, syntax);
	if (syntax === 'websocket') {
		const literals = segments.filter((segment) => segment.kind === 'literal').length;
		const params = segments.length - literals;
		return literals * 100 - params * 10 + segments.length;
	}

	return segments.reduce((score, segment) => {
		if (segment.kind === 'literal') return score + 100;
		if (segment.kind === 'parameter') return score + 50;
		return score + 10;
	}, 0);
}
