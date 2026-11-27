import { HttpError } from '../../errors/http-error.ts';
import { normalizePathname } from '../../utils/path-pattern.ts';
import type { PageParams } from '../../types/contracts.ts';

export type SegmentPathSyntax = 'filesystem' | 'api' | 'explicit' | 'websocket';
export type SegmentPathParams = PageParams;
export type ParsedSegmentPath = readonly string[];

type PatternSegment =
	| { kind: 'literal'; value: string }
	| { kind: 'parameter'; name: string; suffix: string; rawSuffix: string }
	| { kind: 'catch-all'; name: string }
	| { kind: 'wildcard' };

/** Joined catch-all values make `explicit` and `websocket` params plain strings. */
type MatchedParams<S extends SegmentPathSyntax> = S extends 'explicit' | 'websocket'
	? Record<string, string>
	: SegmentPathParams;

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

/**
 * The literal text after a parameter name, which cannot hold the characters that start another parameter.
 *
 * @throws When the suffix holds `:`, `[` or `]`, so a pattern like `/x/:name.:ext` fails when it is compiled
 * instead of matching nothing.
 */
function toParameterSuffix(segment: string, suffix: string): string {
	if (/[:[\]]/u.test(suffix)) {
		throw new Error(
			`Invalid route segment "${segment}": the text after a param name is a literal suffix and cannot hold ":", "[" or "]".`,
		);
	}
	return decodePatternLiteral(suffix);
}

/**
 * Reads `[name]` or `[name].suffix`: the name ends at the first `]`, and what follows must be empty or a literal
 * suffix that starts with a dot.
 */
function parseBracketParameter(segment: string): PatternSegment | null {
	if (!segment.startsWith('[')) return null;
	const close = segment.indexOf(']');
	const name = segment.slice(1, close);
	if (close === -1 || !name || name.startsWith('...')) return null;
	const suffix = segment.slice(close + 1);
	if (suffix && !(suffix.startsWith('.') && suffix.length > 1)) return null;
	return { kind: 'parameter', name, suffix: toParameterSuffix(segment, suffix), rawSuffix: suffix };
}

/**
 * Reads `:name` or `:name.suffix`: the name ends at the first dot, so a dot in a segment starts a literal suffix.
 */
function parseColonParameter(segment: string): PatternSegment | null {
	if (!segment.startsWith(':')) return null;
	const dot = segment.indexOf('.');
	const name = segment.slice(1, dot === -1 ? undefined : dot);
	if (!name || dot === segment.length - 1) return null;
	const rawSuffix = dot === -1 ? '' : segment.slice(dot);
	return { kind: 'parameter', name, suffix: rawSuffix && toParameterSuffix(segment, rawSuffix), rawSuffix };
}

function parseParameterSegment(segment: string, options: SegmentPathSyntaxOptions): PatternSegment | null {
	return (
		(options.bracketParams ? parseBracketParameter(segment) : null) ??
		(options.colonParams ? parseColonParameter(segment) : null)
	);
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
 * A route pattern parsed once, with the specificity score that orders it against other patterns.
 *
 * @remarks
 * Build one with {@link compileSegmentPattern} when the route is registered, so a request only compares
 * path segments. The score is the `api` ordering for every syntax but `websocket`, which has its own.
 */
export type SegmentPattern<S extends SegmentPathSyntax = SegmentPathSyntax> = {
	readonly syntax: S;
	readonly segments: readonly PatternSegment[];
	readonly score: number;
};

function scorePatternSegments(segments: readonly PatternSegment[], syntax: SegmentPathSyntax): number {
	if (syntax === 'websocket') {
		const literals = segments.filter((segment) => segment.kind === 'literal').length;
		const params = segments.length - literals;
		const suffixed = segments.filter((segment) => segment.kind === 'parameter' && segment.suffix).length;
		return literals * 100 - params * 10 + suffixed * 5 + segments.length;
	}

	return segments.reduce((score, segment) => {
		if (segment.kind === 'literal') return score + 100;
		if (segment.kind === 'parameter') return score + (segment.suffix ? 75 : 50);
		return score + 10;
	}, 0);
}

/**
 * How loosely each segment of a pattern matches, up to its catch-all: a literal `0`, a parameter with a literal
 * suffix `1`, a bare parameter `2`. A lower rank is more specific.
 */
export function segmentPathLooseness(pattern: string, syntax: SegmentPathSyntax): number[] {
	const ranks: number[] = [];
	for (const segment of parsePattern(pattern, syntax)) {
		if (segment.kind === 'catch-all' || segment.kind === 'wildcard') break;
		ranks.push(segment.kind === 'literal' ? 0 : segment.suffix ? 1 : 2);
	}
	return ranks;
}

export function compileSegmentPattern<S extends SegmentPathSyntax>(pattern: string, syntax: S): SegmentPattern<S> {
	const segments = parsePattern(pattern, syntax);
	return { syntax, segments, score: scorePatternSegments(segments, syntax) };
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

export function matchParsedSegmentPath<S extends SegmentPathSyntax>(
	pattern: SegmentPattern<S>,
	pathSegments: ParsedSegmentPath,
): MatchedParams<S> | null {
	const patternSegments = pattern.segments;
	const params: SegmentPathParams = {};
	const { catchAllValue } = syntaxOptions[pattern.syntax];

	for (const [index, patternSegment] of patternSegments.entries()) {
		if (patternSegment.kind === 'wildcard') {
			return params as MatchedParams<S>;
		}

		if (patternSegment.kind === 'catch-all') {
			const remainingSegments = pathSegments.slice(index);
			params[patternSegment.name] = catchAllValue === 'joined' ? remainingSegments.join('/') : remainingSegments;
			return params as MatchedParams<S>;
		}

		const pathSegment = pathSegments[index];
		if (pathSegment === undefined) {
			return null;
		}

		if (patternSegment.kind === 'parameter') {
			const { suffix } = patternSegment;
			if (!suffix) {
				params[patternSegment.name] = pathSegment;
				continue;
			}
			if (pathSegment.length <= suffix.length || !pathSegment.endsWith(suffix)) return null;
			params[patternSegment.name] = pathSegment.slice(0, -suffix.length);
			continue;
		}

		if (patternSegment.value !== pathSegment) {
			return null;
		}
	}

	return pathSegments.length === patternSegments.length ? (params as MatchedParams<S>) : null;
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
	return matchParsedSegmentPath(compileSegmentPattern(pattern, syntax), parseSegmentPath(pathname));
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

			const values = Array.isArray(value) ? value : [value];
			if (patternSegment.kind !== 'parameter' || !patternSegment.suffix || values.length === 0) return values;
			return [...values.slice(0, -1), `${values.at(-1)}${patternSegment.rawSuffix}`];
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
		if (segment.kind !== 'parameter') return '[...]';
		return segment.suffix ? `[]${encodeURIComponent(segment.suffix)}` : '[]';
	});
	return `/${segments.join('/')}`;
}
