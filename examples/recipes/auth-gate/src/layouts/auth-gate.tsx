import type { EcoPageLayoutEntrySpec, LayoutProps } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';

type AuthGateProps = LayoutProps<JsxRenderable> & {
	user?: string;
};

/** Renders the page for a signed-in visitor and a sign-in form, without the page, for everyone else. */
export function AuthGate({ children, user }: AuthGateProps) {
	if (!user) {
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
			<p>Signed in as {user}</p>
			{children}
		</main>
	);
}

/** Layout entry that hands the gate the signed-in user from `locals.session`. */
export const authGateLayout = {
	component: AuthGate,
	props: ({ locals }) => ({ user: locals?.session?.user }),
} satisfies EcoPageLayoutEntrySpec<JsxRenderable>;
