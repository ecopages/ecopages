import { describe, expect, it } from 'vitest';
import { StoreAgentToolsHost } from './store-agent-tools';

/**
 * The host the layout renders, which tells the browser whether `get_ucp_profile` has a profile to read.
 */
describe('StoreAgentToolsHost', () => {
	const rendered = (ucp?: boolean) => JSON.stringify(StoreAgentToolsHost({ ucp }));

	it('sets the ucp attribute for a connected Shopify store', () => {
		expect(rendered(true)).toContain('"bool:ucp":true');
	});

	it('leaves it off on the demo catalog and by default', () => {
		expect(rendered(false)).not.toContain('"bool:ucp":true');
		expect(rendered()).not.toContain('"bool:ucp":true');
	});
});
