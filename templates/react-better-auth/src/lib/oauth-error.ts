import type { PageQuery } from '@ecopages/core';

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
	account_not_linked:
		'This email already has an account. Sign in with email and password instead, then link GitHub from your dashboard.',
	unable_to_link_account: 'GitHub could not be linked to this account.',
	access_denied: 'GitHub sign-in was cancelled.',
	invalid_code: 'GitHub sign-in expired. Try again.',
	signup_disabled: 'GitHub sign-up is disabled.',
};

function firstQueryValue(value: string | string[] | null | undefined): string | undefined {
	if (Array.isArray(value)) {
		return value[0];
	}

	return value ?? undefined;
}

/**
 * Maps Better Auth OAuth callback query params to a user-facing message.
 *
 * @remarks
 * After GitHub returns, Better Auth redirects to `errorCallbackURL?error=...`.
 * The machine-readable `error` code is what the login/signup pages should display.
 */
export function messageForOAuthError(query?: PageQuery | URLSearchParams | null): string | null {
	if (!query) {
		return null;
	}

	const code = query instanceof URLSearchParams ? query.get('error') : firstQueryValue(query.error);
	if (!code) {
		return null;
	}

	const description =
		query instanceof URLSearchParams ? query.get('error_description') : firstQueryValue(query.error_description);

	return OAUTH_ERROR_MESSAGES[code] ?? description ?? `GitHub sign-in failed (${code}).`;
}

/**
 * Drops OAuth error params from the address bar after the message has been shown.
 */
export function clearOAuthErrorParams(): void {
	const url = new URL(window.location.href);
	if (!url.searchParams.has('error')) {
		return;
	}

	url.searchParams.delete('error');
	url.searchParams.delete('error_description');
	window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
}
