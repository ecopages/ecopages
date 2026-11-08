import { expect, test } from '../../app-fixture.ts';
import { expectGatedLayout } from './auth-gate.shared.ts';

test('in development, the layout gates the page and warns that it dropped its children', async ({ app, request }) => {
	await expectGatedLayout(request);

	expect(app.getServerOutput()).toContain('Layout AuthGate (src/pages/dashboard.tsx) did not render its children');
});
