import { describe, expect, it } from 'vitest';
import { formatRuntimeServerStartedMessage, resolveProcessRuntimeLabel } from './runtime-server-started-message.ts';

describe('resolveProcessRuntimeLabel', () => {
	it('names Node when the process is Node', () => {
		expect(resolveProcessRuntimeLabel()).toBe('Node');
	});
});

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
