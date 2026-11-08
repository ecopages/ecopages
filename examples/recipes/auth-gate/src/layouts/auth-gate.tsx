import type { LayoutProps } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';

/** Renders the page for a signed-in visitor and a sign-in form, without the page, for everyone else. */
export function AuthGate({ children, locals }: LayoutProps<JsxRenderable>) {
	if (!locals?.session) {
		return (
			<main data-gate="sign-in">
				<h1>Sign in to continue</h1>
				<form method="post" action="/api/sign-in">
					<button type="submit">Sign in</button>
				</form>
			</main>
		);
	}

	return (
		<main data-gate="page">
			<p>Signed in as {locals.session.user}</p>
			{children}
		</main>
	);
}
