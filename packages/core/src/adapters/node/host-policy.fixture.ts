import { createHostPolicy } from '../shared/http/host-policy.ts';

/**
 * A host policy that answers every named host, for tests that bind a server and are not about which hosts it serves.
 */
export const anyHostPolicy = createHostPolicy({
	allowedHosts: true,
	baseUrl: 'http://localhost:3000',
	development: false,
});
