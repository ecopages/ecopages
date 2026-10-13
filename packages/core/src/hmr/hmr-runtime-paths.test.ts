import { describe, expect, it } from 'vitest';
import { resolveHmrRuntimeWorkDir } from './hmr-runtime-paths.ts';

describe('hmr-runtime-paths', () => {
	it('resolveHmrRuntimeWorkDir joins the work dir with the runtime segment', () => {
		expect(resolveHmrRuntimeWorkDir('/app/.eco/public')).toBe('/app/.eco/public/assets/hmr-runtime');
	});
});
