import { describeCommerceBackendContract } from '../contract.fixture.ts';
import { createDrizzleBackend } from './adapter.server.ts';
import { openTestCatalog } from './database.fixture.ts';

describeCommerceBackendContract('drizzle', async () => {
	const database = await openTestCatalog();
	return {
		backend: createDrizzleBackend({
			getDb: async () => database.db,
			getCartSecret: () => 'contract-test-secret-of-at-least-32-chars',
		}),
		dispose: database.dispose,
	};
});
