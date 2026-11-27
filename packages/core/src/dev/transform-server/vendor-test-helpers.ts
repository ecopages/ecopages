import assert from 'node:assert/strict';
import { path } from '@ecopages/file-system/path';
import { expect } from 'vitest';
import type { DevTransformVendorRegistry } from './dev-transform-vendor-registry.ts';

/** Relative imports of a served vendor file, resolved to the URLs the browser would request. */
function relativeVendorImports(url: string, code: string): string[] {
	const specifiers = [...code.matchAll(/(?:from|import)\s*\(?\s*["'](\.\.?\/[^"']+)["']/g)].map((match) => match[1]);
	return specifiers.map((specifier) => path.join(path.dirname(url), specifier));
}

/** Every vendor file the browser loads for `urls`, by URL. */
export async function readVendorGraph(
	registry: DevTransformVendorRegistry,
	urls: string[],
): Promise<Map<string, string>> {
	const files = new Map<string, string>();
	const pending = [...urls];
	while (pending.length > 0) {
		const url = pending.pop();
		if (!url || files.has(url)) continue;
		const response = await registry.tryHandleVendorRequest(url);
		assert.ok(response, `no vendor response for ${url}`);
		expect(response.status).toBe(200);
		const code = await response.text();
		files.set(url, code);
		pending.push(...relativeVendorImports(url, code));
	}
	return files;
}
