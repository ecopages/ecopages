import { describe, expect, it } from 'vitest';
import {
	HMR_RUNTIME_SCRIPT_URL,
	HMR_RUNTIME_WORK_DIR_SEGMENT,
	HMR_WEBSOCKET_PATH,
	resolveHmrRuntimeWorkDir,
} from './hmr-runtime-paths.ts';

describe('hmr-runtime-paths', () => {
	it('exposes stable runtime URL and websocket path constants', () => {
		expect(HMR_RUNTIME_SCRIPT_URL).toBe('/_hmr_runtime.js');
		expect(HMR_WEBSOCKET_PATH).toBe('/_hmr');
		expect(HMR_RUNTIME_WORK_DIR_SEGMENT).toBe('hmr-runtime');
	});

	it('resolveHmrRuntimeWorkDir joins the work dir with the runtime segment', () => {
		expect(resolveHmrRuntimeWorkDir('/app/.eco/public')).toBe('/app/.eco/public/assets/hmr-runtime');
	});
});
