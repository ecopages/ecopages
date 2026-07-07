import { describe, expect, it } from 'vitest';
import { formatRuntimeServerStartedMessage } from './runtime-server-started-message.ts';

describe('formatRuntimeServerStartedMessage', () => {
	it('formats Bun and Node with the same template', () => {
		expect(formatRuntimeServerStartedMessage('Bun', 'http://localhost:4007/')).toBe(
			'Bun server running at http://localhost:4007',
		);
		expect(formatRuntimeServerStartedMessage('Node', 'http://localhost:4007/')).toBe(
			'Node server running at http://localhost:4007',
		);
	});
});
