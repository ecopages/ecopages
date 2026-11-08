import { describe, expect, it } from 'vitest';
import { getUnsupportedNodeMessage } from './node-version.js';

describe('getUnsupportedNodeMessage', () => {
	it.each(['24.22.0', '24.22.3', '24.30.1', '26.0.0', '27.1.0'])('accepts Node %s', (node) => {
		expect(getUnsupportedNodeMessage({ node })).toBeUndefined();
	});

	it.each(['22.22.3', '24.0.0', '24.15.0', '24.21.9', '25.0.0', '25.9.0', '20.19.0'])('rejects Node %s', (node) => {
		expect(getUnsupportedNodeMessage({ node })).toContain(`this is Node.js ${node}`);
	});

	it('does not check a Bun launch', () => {
		expect(getUnsupportedNodeMessage({ node: '24.3.0', bun: '1.3.0' })).toBeUndefined();
	});
});
