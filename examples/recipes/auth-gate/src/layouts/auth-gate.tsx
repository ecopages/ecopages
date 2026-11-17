import type { EcoPageLayoutEntrySpec, LayoutProps } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import type { Session } from '../lib/session.server';

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

type SessionLocals = { session: Session | null };

/**
 * Layout entry that hands the gate the signed-in user from `locals.session`.
 *
 * @remarks
 * The factory annotates the local it reads, so only a Page whose `middleware` list provides `session` accepts the
 * entry. `loadSession` always provides it, as `null` for a signed-out visitor.
 */
export const authGateLayout = {
	component: AuthGate,
	props: ({ locals }: { locals: SessionLocals }) => ({ user: locals.session?.user }),
} satisfies EcoPageLayoutEntrySpec<JsxRenderable, { locals: SessionLocals }>;
