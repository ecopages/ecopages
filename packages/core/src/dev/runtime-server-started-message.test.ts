import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatRuntimeServerStartedMessage, resolveProcessRuntimeLabel } from './runtime-server-started-message.ts';

describe('resolveProcessRuntimeLabel', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('names Node when the process is Node', () => {
		expect(resolveProcessRuntimeLabel()).toBe('Node');
	});

	it('names Bun when the process is Bun', () => {
		vi.stubGlobal('Bun', {});
		expect(resolveProcessRuntimeLabel()).toBe('Bun');
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
