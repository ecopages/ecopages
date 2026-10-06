import { describe, expect, it } from 'vitest';
import { formatBuildLog } from './build-log.ts';

describe('formatBuildLog', () => {
	it('prefixes the plugin and location, then adds the frame and stack frames', () => {
		const text = formatBuildLog({
			message: 'loader boom',
			plugin: 'eco-loader',
			id: '/app/src/styles.eco',
			loc: { file: '/app/src/styles.eco', line: 2, column: 4 },
			frame: '2: body {',
			stack: 'Error: loader boom\n    at load (/app/plugins/eco-loader.ts:10:11)',
		});

		expect(text).toBe(
			[
				'[eco-loader] /app/src/styles.eco:2:4: loader boom',
				'2: body {',
				'    at load (/app/plugins/eco-loader.ts:10:11)',
			].join('\n'),
		);
	});

	it('uses the id when there is no location and keeps a bare message as is', () => {
		expect(formatBuildLog({ message: 'resolve failed', id: '/app/src/index.ts' })).toBe(
			'/app/src/index.ts: resolve failed',
		);
		expect(formatBuildLog({ message: 'Unknown build error' })).toBe('Unknown build error');
	});
});
