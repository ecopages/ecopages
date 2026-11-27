import { createMiddleware } from '../src/middleware/create-middleware.ts';
import { eco } from '../src/eco/eco.ts';
import type { PageBuildContext, PageParams, PageQuery } from '../src/types/contracts.ts';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
function assert<T extends true>(): T | void {}

const session = createMiddleware((_ctx, next) => next({ session: { userId: 'u1' } }));
const tag = createMiddleware((_ctx, next) => next({ tag: 'x' }));

// a Dynamic Page's props is its request handler: it reads the request, Query and the locals of its middleware list
eco.page({
	cache: 'dynamic',
	middleware: [session, tag],
	props: ({ request, params, query, locals }) => {
		assert<Equal<typeof request, Request>>();
		assert<Equal<typeof query, PageQuery>>();
		assert<Equal<typeof locals.session, { userId: string }>>();
		assert<Equal<typeof locals.tag, string>>();
		return { userId: locals.session.userId, slug: String(params.slug) };
	},
	render: ({ userId, slug }) => `${userId}${slug}`,
});

// props cannot write locals
eco.page({
	cache: 'dynamic',
	middleware: [session],
	props: ({ locals }) => {
		// @ts-expect-error locals are read-only in props
		locals.session = { userId: 'other' };
		return {};
	},
	render: () => '',
});

// a Static Page's props has the build context only
eco.page({
	props: (context) => {
		assert<Equal<keyof typeof context, 'params' | 'appConfig' | 'runtimeOrigin'>>();
		// @ts-expect-error no request exists at build
		void context.request;
		// @ts-expect-error no locals exist at build
		void context.locals;
		return { slug: String(context.params.slug) };
	},
	render: ({ slug }) => slug,
});

// a revalidating Page's props has the build context only, and it may return its props without a Promise
eco.page({
	cache: { revalidate: 60 },
	props: (context) => {
		// @ts-expect-error a revalidating Page regenerates without a request
		void context.request;
		return { title: 'cached' };
	},
	render: ({ title }) => title,
});

// a cache function reads the props the Page resolved with its Params and Query, and returns a strategy that is never dynamic
eco.page({
	props: () => ({ category: 'seating' }),
	cache: ({ props, params, query }) => {
		assert<Equal<typeof props.category, string>>();
		assert<Equal<typeof params, PageParams>>();
		assert<Equal<typeof query, PageQuery>>();
		return { revalidate: 60, tags: [props.category, `product:${params.slug}`] };
	},
	render: ({ category }) => category,
});

eco.page({
	// @ts-expect-error a cache function returns a stored strategy, and a Dynamic Page declares cache: 'dynamic' itself
	cache: () => 'dynamic',
	render: () => '',
});

// a Dynamic Page's dependency resolver reads Params and Query, never props
eco.page({
	cache: 'dynamic',
	props: () => ({ secret: 'request data' }),
	dependencies: (context) => {
		assert<Equal<keyof typeof context, 'params' | 'query'>>();
		// @ts-expect-error props come from the request, so they cannot decide a cached Page Browser Graph
		void context.props;
		return { components: [] };
	},
	render: () => '',
});

// a Static Page's dependency resolver keeps its props
eco.page<{ chart: boolean }>({
	props: () => ({ chart: true }),
	dependencies: ({ props }) => {
		assert<Equal<typeof props.chart, boolean>>();
		return { components: [] };
	},
	render: () => '',
});

// a Page returns a union on cache, so calling its props hook needs a branch
const page = eco.page({ props: () => ({ a: 1 }), render: () => '' });
declare const buildContext: PageBuildContext;
// @ts-expect-error a Dynamic Page's props needs the request context
void page.props?.(buildContext);
if (page.cache !== 'dynamic') void page.props?.(buildContext);
