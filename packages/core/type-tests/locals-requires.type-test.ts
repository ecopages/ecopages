import { eco } from '@ecopages/core/eco';

declare module '@ecopages/core' {
	interface RequestLocals {
		session?: { userId: string } | null;
		featureFlag?: boolean | undefined;
	}
}

eco.page({
	render: (props) => {
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		props.locals?.session?.userId;

		// @ts-expect-error locals can be undefined without requires
		props.locals.session;

		return '';
	},
});

eco.page({
	requires: 'session',
	render: (props) => {
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		props.locals.session.userId;

		// @ts-expect-error required locals key is non-nullable
		const _sessionMustNotBeNull: null = props.locals.session;

		// Non-required keys remain optional
		props.locals.featureFlag?.valueOf();

		// @ts-expect-error unknown key should not exist
		props.locals.notARealKey;

		return '';
	},
});

eco.page({
	requires: ['session'] as const,
	render: (props) => {
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		props.locals.session.userId;
		return '';
	},
});

eco.page({
	middleware: [
		async (ctx, next) => {
			// Without requires, locals properties can be undefined
			// eslint-disable-next-line @typescript-eslint/no-unused-expressions
			ctx.locals?.session?.userId;

			return next();
		},
	],
	render: (props) => {
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		props.locals?.session?.userId;

		// @ts-expect-error locals can be undefined without requires in render too
		props.locals.session;

		return '';
	},
});

eco.page({
	requires: 'session',
	middleware: [
		async (ctx, next) => {
			// Note: middleware context does not inherit requires typing
			// This is because middleware is defined generically and runs before locals are guaranteed
			// Use ctx.require() to safely access required locals
			const session = ctx.require('session', () => new Response('Unauthorized', { status: 401 }));

			// eslint-disable-next-line @typescript-eslint/no-unused-expressions
			session.userId;

			// Non-required keys remain optional in middleware
			ctx.locals.featureFlag?.valueOf();

			return next();
		},
	],
	render: (props) => {
		// With requires, session is guaranteed to be non-null in render
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		props.locals.session.userId;

		// @ts-expect-error required locals key is non-nullable
		const _sessionMustNotBeNull: null = props.locals.session;

		return '';
	},
});

eco.page({
	requires: ['session'] as const,
	middleware: [
		async (ctx, next) => {
			// Array form of requires should also work in render
			// But middleware still needs to use ctx.require()
			const session = ctx.require('session', () => new Response('Unauthorized', { status: 401 }));

			// eslint-disable-next-line @typescript-eslint/no-unused-expressions
			session.userId;

			return next();
		},
	],
	render: (props) => {
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		props.locals.session.userId;
		return '';
	},
});

eco.page({
	requires: 'session',
	middleware: [
		async (ctx, next) => {
			// Middleware can use require() to get a required local
			const session = ctx.require('session', () => new Response('Unauthorized', { status: 401 }));

			// eslint-disable-next-line @typescript-eslint/no-unused-expressions
			session.userId;

			// @ts-expect-error session should be non-nullable from require()
			const _sessionMustNotBeNull: null = session;

			return next();
		},
	],
	render: () => '',
});

eco.page({
	middleware: [
		async (ctx, next) => {
			// Without requires, require() can be used to get non-null access
			const session = ctx.require('session', () => new Response('Unauthorized', { status: 401 }));

			// eslint-disable-next-line @typescript-eslint/no-unused-expressions
			session.userId;

			// @ts-expect-error session should be non-nullable from require()
			const _sessionMustNotBeNull: null = session;

			// Can require multiple keys
			const { session: session2, featureFlag } = ctx.require(
				['session', 'featureFlag'] as const,
				() => new Response('Missing required data', { status: 400 }),
			);

			// eslint-disable-next-line @typescript-eslint/no-unused-expressions
			session2.userId;

			// @ts-expect-error featureFlag should be non-nullable from require()
			const _featureFlagMustNotBeNull: null = featureFlag;

			return next();
		},
	],
	render: () => '',
});

export {};
