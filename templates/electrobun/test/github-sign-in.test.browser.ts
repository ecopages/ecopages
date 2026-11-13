import { afterEach, expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';

afterEach(() => {
	vi.unstubAllGlobals();
	document.body.replaceChildren();
});

test('lets the user retry when the system browser cannot open', async () => {
	document.body.innerHTML = `
		<button id="github-sign-in" type="button">Continue with GitHub</button>
		<p id="github-status" role="status" hidden></p>
	`;
	const startSignIn = vi.fn(async () => new Response(null, { status: 502 }));
	vi.stubGlobal('fetch', startSignIn);
	await import('../src/lib/github-sign-in');

	const button = page.getByRole('button', { name: 'Continue with GitHub' });
	await button.click();
	await expect.element(page.getByRole('status')).toHaveTextContent('GitHub sign-in did not finish. Try again.');
	await expect.element(button).toBeEnabled();
	expect(startSignIn).toHaveBeenCalledWith('/auth/github/start', expect.objectContaining({ method: 'POST' }));
});
