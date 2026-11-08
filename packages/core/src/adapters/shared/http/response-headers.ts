import type { ResponseHeaderRule } from '../../../config/user-config-types.ts';

const HEADER_NAME = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const FORBIDDEN_VALUE = /[\r\n\0]/;
const FORBIDDEN_SOURCE = /[?#\s]|[[\](){}!+@|\\]/;

/**
 * Checks the `headers` option of `eco.config.ts`.
 *
 * @remarks
 * A `source` is a URL pathname pattern: it starts with `/`, `*` matches any characters except `/` and `**`
 * matches any characters including `/`. Other pattern syntax is rejected instead of being read as literal text.
 *
 * @throws When a rule has no usable `source` pattern, or a header has an invalid name or value.
 */
export function assertResponseHeaderRules(rules: unknown): asserts rules is readonly ResponseHeaderRule[] {
	if (!Array.isArray(rules)) {
		throw new Error('Invalid "headers" option: expected an array of { source, headers } rules.');
	}

	rules.forEach((rule: unknown, index) => {
		const where = `Invalid "headers" option at index ${index}`;
		if (typeof rule !== 'object' || rule === null) {
			throw new Error(`${where}: expected an object with "source" and "headers".`);
		}

		const { source, headers } = rule as { source?: unknown; headers?: unknown };
		if (typeof source !== 'string' || !source.startsWith('/')) {
			throw new Error(
				`${where}: "source" must be a path pattern starting with "/", such as "/**" or "/assets/*".`,
			);
		}
		if (FORBIDDEN_SOURCE.test(source)) {
			throw new Error(
				`${where}: "source" ${JSON.stringify(source)} uses unsupported pattern syntax. Only "*" and "**" are supported.`,
			);
		}
		if (typeof headers !== 'object' || headers === null || Array.isArray(headers)) {
			throw new Error(`${where}: "headers" must be an object of header names to string values.`);
		}

		for (const [name, value] of Object.entries(headers)) {
			if (!HEADER_NAME.test(name)) {
				throw new Error(`${where}: ${JSON.stringify(name)} is not a valid header name.`);
			}
			if (typeof value !== 'string' || FORBIDDEN_VALUE.test(value)) {
				throw new Error(`${where}: the value of "${name}" must be a string without line breaks.`);
			}
		}
	});
}

/**
 * Tests a URL pathname against a `source` pattern of the `headers` option.
 *
 * @remarks
 * The pattern must match the whole pathname. `**` followed by `/` also matches no segment, so `/**\/*.wasm`
 * matches `/a.wasm` as well as `/a/b.wasm`. The pathname is matched as the request sends it, percent-encoding included.
 */
export function matchesResponseHeaderSource(source: string, pathname: string): boolean {
	let pattern = '';
	for (let index = 0; index < source.length; index += 1) {
		const char = source[index];
		if (char === '*' && source[index + 1] === '*') {
			const slash = source[index + 2] === '/';
			pattern += slash ? '(?:.*/)?' : '.*';
			index += slash ? 2 : 1;
		} else if (char === '*') {
			pattern += '[^/]*';
		} else {
			pattern += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		}
	}
	return new RegExp(`^${pattern}$`, 's').test(pathname);
}

/**
 * Adds the configured headers whose `source` matches the request path to a response.
 *
 * @remarks
 * Rules apply in config order, so a later rule wins over an earlier one. A configured header replaces a header
 * of the same name the framework or a handler already set, which is how an app overrides one deliberately; every
 * other header stays. A response no rule matches is returned as it is. Otherwise the result is a new
 * `Response` over the same body, because a handler may return a response whose headers are immutable.
 */
export function applyResponseHeaders(
	response: Response,
	request: Request,
	rules: readonly ResponseHeaderRule[] | undefined,
): Response {
	if (!rules?.length) return response;

	const { pathname } = new URL(request.url);
	const matching = rules.filter((rule) => matchesResponseHeaderSource(rule.source, pathname));
	if (matching.length === 0) return response;

	const headers = new Headers(response.headers);
	for (const rule of matching) {
		for (const [name, value] of Object.entries(rule.headers)) headers.set(name, value);
	}
	return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
