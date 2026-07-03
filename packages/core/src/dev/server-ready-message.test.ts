import { describe, expect, it } from 'vitest';
import { ECOPAGES_SERVER_READY_MARKER, formatServerReadyMessage } from './server-ready-message.ts';

describe('formatServerReadyMessage', () => {
	it('formats an optional e2e-ready log line', () => {
		expect(formatServerReadyMessage('http://localhost:4007/')).toBe(
			`${ECOPAGES_SERVER_READY_MARKER} http://localhost:4007`,
		);
	});
});
