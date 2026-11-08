import { test } from '@playwright/test';
import { expectGatedLayout } from './auth-gate.shared.ts';

test('in production, the layout gates the page without failing the request', async ({ request }) => {
	await expectGatedLayout(request);
});
