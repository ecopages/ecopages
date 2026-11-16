import { createMiddleware } from '../src/middleware/create-middleware.ts';
import { eco } from '../src/eco/eco.ts';
import type { EcoPageLayoutEntrySpec, LayoutProps, LayoutPropsContext } from '../src/types/contracts.ts';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
function assert<T extends true>(): T | void {}

type Session = { userId: string };

const session = createMiddleware((_ctx, next) => next({ session: { userId: 'u1' } satisfies Session }));
const tag = createMiddleware((_ctx, next) => next({ tag: 'x' }));
const role = createMiddleware((_ctx, next) => next({ role: 'admin' as 'admin' | 'member' }));
const roleAsString = createMiddleware((_ctx, next) => next({ role: 'guest' }));

const Shell = eco.layout<string, LayoutProps<string> & { user?: string; label?: string }>({
	render: ({ children, user }) => `${user}${children}`,
});
const Plain = ({ children }: LayoutProps<string>) => children ?? '';

// an inline entry reads the locals of the Page's middleware list
eco.page({
	cache: 'dynamic',
	middleware: [session, tag],
	layout: {
		component: Shell,
		props: ({ locals }) => {
			assert<Equal<typeof locals.session, { userId: string }>>();
			assert<Equal<typeof locals.tag, string>>();
			return { user: locals.session.userId };
		},
	},
	render: () => '',
});

// an inline entry inside a layout array, beside a plain layout function
eco.page({
	cache: 'dynamic',
	middleware: [session],
	layout: [Plain, { component: Shell, props: ({ locals }) => ({ user: locals.session.userId }) }],
	render: () => '',
});

// a local the list does not provide is an error
eco.page({
	cache: 'dynamic',
	middleware: [tag],
	layout: {
		component: Shell,
		// @ts-expect-error no middleware in the list provides `nope`
		props: ({ locals }) => ({ user: locals.nope }),
	},
	render: () => '',
});

// an inline factory cannot write locals
eco.page({
	cache: 'dynamic',
	middleware: [session],
	layout: {
		component: Shell,
		props: ({ locals }) => {
			// @ts-expect-error locals are read-only in a layout factory
			locals.session = { userId: 'other' };
			return {};
		},
	},
	render: () => '',
});

// plain layouts need no factory
eco.page({ cache: 'dynamic', middleware: [session], layout: Plain, render: () => '' });
eco.page({ layout: [Plain, Shell], render: () => '' });

// a shared entry annotates the locals it reads once, on its factory parameter
const sessionLayout = {
	component: Shell,
	props: ({ locals }: { locals: { session: Session } }) => ({ user: locals.session.userId }),
};

// (b) accepted on a Page whose list provides them, alongside other locals
eco.page({ cache: 'dynamic', middleware: [session, tag, role], layout: sessionLayout, render: () => '' });
eco.page({ cache: 'dynamic', middleware: [tag, session], layout: [Plain, sessionLayout], render: () => '' });

// (a) a Page whose list does not provide them does not compile
// @ts-expect-error the list provides no `session`
eco.page({ cache: 'dynamic', middleware: [tag], layout: sessionLayout, render: () => '' });
// @ts-expect-error a Dynamic Page without middleware provides no `session`
eco.page({ cache: 'dynamic', layout: sessionLayout, render: () => '' });

// a shared entry that reads a nullable local takes it from a middleware that always provides the key
const readSession = (): Session | null => null;
const loadSession = createMiddleware((_ctx, next) => next({ session: readSession() }));
const nullableSessionLayout = {
	component: Shell,
	props: ({ locals }: { locals: { session: Session | null } }) => ({ user: locals.session?.userId }),
};
eco.page({ cache: 'dynamic', middleware: [loadSession], layout: nullableSessionLayout, render: () => '' });
eco.page({ cache: 'dynamic', middleware: [session], layout: nullableSessionLayout, render: () => '' });
// @ts-expect-error a Page whose list does not provide the key does not compile
eco.page({ cache: 'dynamic', middleware: [tag], layout: nullableSessionLayout, render: () => '' });

// a shared entry that reads an optional local works on any Dynamic Page, and finds it only where a middleware provides it
const optionalSessionLayout = {
	component: Shell,
	props: ({ locals }: { locals: { session?: Session | null } }) => ({ user: locals.session?.userId }),
};
eco.page({ cache: 'dynamic', middleware: [tag], layout: optionalSessionLayout, render: () => '' });
eco.page({ cache: 'dynamic', middleware: [session], layout: optionalSessionLayout, render: () => '' });

// a shared entry typed with the exported names works on any Page and reads no locals
const satisfiedLayout = {
	component: Shell,
	props: ({ params }: LayoutPropsContext) => ({ label: String(params?.slug) }),
} satisfies EcoPageLayoutEntrySpec<string>;
eco.page({ cache: 'dynamic', middleware: [session], layout: satisfiedLayout, render: () => '' });
eco.page({ layout: satisfiedLayout, render: () => '' });
const readsUntypedLocals = {
	component: Shell,
	// @ts-expect-error `LayoutPropsContext` carries no locals keys
	props: ({ locals }: LayoutPropsContext) => ({ user: locals?.session }),
};
void readsUntypedLocals;

// without a list, a Dynamic Page's factory has no locals keys
eco.page({
	cache: 'dynamic',
	layout: {
		component: Shell,
		props: ({ locals }) => {
			assert<Equal<typeof locals, Readonly<{}>>>();
			// @ts-expect-error no middleware provides `session`
			return { user: locals.session };
		},
	},
	render: () => '',
});

// (c) a later entry overrides an earlier one, as the runtime merge does
eco.page({
	cache: 'dynamic',
	middleware: [role, roleAsString],
	layout: {
		component: Shell,
		props: ({ locals }) => {
			assert<Equal<typeof locals.role, string>>();
			return { label: locals.role };
		},
	},
	render: () => '',
});
eco.page({
	cache: 'dynamic',
	middleware: [roleAsString, role],
	layout: {
		component: Shell,
		props: ({ locals }) => {
			assert<Equal<typeof locals.role, 'admin' | 'member'>>();
			return { label: locals.role };
		},
	},
	render: () => '',
});

// (d) a Static Page's factory has no request: it reads Params and no locals
eco.page({
	layout: {
		component: Shell,
		props: (context) => {
			// @ts-expect-error no locals exist when a Static Page renders
			void context.locals;
			return { label: String(context.params?.slug) };
		},
	},
	render: () => '',
});

// (d) a revalidating Page's factory has no locals either
eco.page({
	cache: { revalidate: 60 },
	layout: {
		component: Shell,
		// @ts-expect-error a revalidating Page regenerates without a request
		props: ({ locals }) => ({ user: locals.session }),
	},
	render: () => '',
});

// (d) a shared entry that reads locals does not compile on a Static Page
eco.page({
	// @ts-expect-error a Static Page provides no locals
	layout: sessionLayout,
	render: () => '',
});
// @ts-expect-error a Static Page provides no locals, even optional ones
eco.page({
	cache: 'static',
	layout: [Plain, optionalSessionLayout],
	render: () => '',
});

// a layout entry cannot wrap a component that does not take children
const NotALayout = eco.component<{ title: string }, string>({ render: ({ title }) => title });
// @ts-expect-error a layout component takes LayoutProps
eco.page({ cache: 'dynamic', middleware: [session], layout: { component: NotALayout }, render: () => '' });
