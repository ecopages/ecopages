import { expect, type APIRequestContext } from '@playwright/test';

/** Asserts the auth-gated layout recipe against the server `request` is pointed at. */
export async function expectGatedLayout(request: APIRequestContext): Promise<void> {
	const guest = await request.get('/dashboard');
	expect(guest.status()).toBe(200);
	const guestHtml = await guest.text();
	expect(guestHtml).toContain('Sign in to continue');
	expect(guestHtml).not.toContain('<h1>Dashboard</h1>');

	const signedIn = await request.get('/dashboard', { headers: { cookie: 'session=ada' } });
	const signedInHtml = await signedIn.text();
	expect(signedInHtml).toContain('Signed in as ada');
	expect(signedInHtml).toContain('<h1>Dashboard</h1>');
	expect(signedInHtml).not.toContain('Sign in to continue');

	const redirected = await request.get('/account', { maxRedirects: 0 });
	expect(redirected.status()).toBe(302);
	expect(new URL(redirected.headers()['location'] as string, 'http://localhost').pathname).toBe('/sign-in');

	const account = await request.get('/account', { headers: { cookie: 'session=ada' } });
	expect(await account.text()).toContain('Account of ada');

	const signIn = await request.post('/api/sign-in', { maxRedirects: 0 });
	expect(signIn.status()).toBe(303);
	expect(signIn.headers()['set-cookie']).toContain('session=demo');
	expect(signIn.headers()['location']).toBe('/dashboard');
}
