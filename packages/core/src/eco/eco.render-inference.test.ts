import { describe, expectTypeOf, it } from 'vitest';
import type { FileRouteMiddlewareContext, LayoutProps } from '../types/contracts.ts';
import type { PropsOf, ResultOf } from '../types/eco-api-types.ts';
import { eco } from './eco.ts';

declare module '../types/contracts.ts' {
	interface RequestLocals {
		renderInferenceSession?: { userId: string } | null;
	}
}

type Props = { title: string };

describe('page props inference from staticProps and render', () => {
	it('infers props from an annotated render alone', () => {
		const Page = eco.page({ render: ({ title }: Props) => `<h1>${title}</h1>` });
		expectTypeOf(Page).parameter(0).toMatchObjectType<Props>();
	});

	it('types metadata and dependencies from the render annotation', () => {
		eco.page({
			metadata: ({ props }) => ({ title: props.title, description: 'd' }),
			render: ({ title }: Props) => `<h1>${title}</h1>`,
		});
		eco.page({
			// @ts-expect-error title is a string, not a number
			metadata: ({ props }) => ({ title: props.title.toFixed() }),
			render: ({ title }: Props) => `<h1>${title}</h1>`,
		});
	});

	it('types metadata from staticProps when render is unannotated', () => {
		eco.page({
			staticProps: async () => ({ props: { title: 'x', count: 2 } }),
			metadata: ({ props }) => ({ title: `${props.title}${props.count.toFixed()}`, description: 'd' }),
			render: ({ title, count }) => `<h1>${title}${count}</h1>`,
		});
		eco.page({
			staticProps: async () => ({ props: { title: 'x' } }),
			// @ts-expect-error count is not returned by staticProps
			render: ({ count }) => `<h1>${count}</h1>`,
		});
	});

	it('keeps params and query typed beside staticProps', () => {
		eco.page({
			staticPaths: async () => ({ paths: [{ params: { slug: 'a' } }] }),
			staticProps: async ({ pathname }) => ({ props: { slug: String(pathname.params.slug) } }),
			render: ({ slug, params, query }) => `${slug}${params?.slug}${query?.page}`,
		});
	});

	it('narrows locals through requires while props still come from staticProps', () => {
		eco.page({
			requires: 'renderInferenceSession',
			staticProps: async () => ({ props: { title: 'x' } }),
			render: ({ title, locals }) => `${title}${locals.renderInferenceSession.userId}`,
		});
		eco.page({
			requires: ['renderInferenceSession'] as const,
			render: ({ locals }: { locals: { renderInferenceSession: { userId: string } } }) =>
				locals.renderInferenceSession.userId,
		});
		// @ts-expect-error without requires the local may be missing
		eco.page({ render: ({ locals }) => locals.renderInferenceSession.userId });
	});

	it('accepts cache and middleware options beside inferred props', () => {
		eco.page({
			cache: 'dynamic',
			middleware: [async (ctx: FileRouteMiddlewareContext, next) => (ctx.locals, next())],
			staticProps: async () => ({ props: { title: 'x' } }),
			render: ({ title }) => title,
		});
		// @ts-expect-error middleware requires a dynamic cache
		eco.page({
			cache: 'static',
			middleware: [],
			render: () => '',
		});
	});

	it('infers extra layout props from an annotated render', () => {
		const Prose = eco.layout({
			render: ({ children, prose }: LayoutProps<string> & { prose?: boolean }) =>
				`<main data-prose="${prose}">${children}</main>`,
		});
		expectTypeOf(Prose).parameter(0).toHaveProperty('prose').toEqualTypeOf<boolean | undefined>();
		eco.page({ layout: Prose, render: () => '' });
	});

	it('drops extra layout props when the annotated children are wider than the inferred element', () => {
		const Prose = eco.layout({
			render: ({ children, prose }: LayoutProps & { prose?: boolean }) =>
				`<main data-prose="${prose}">${children}</main>`,
		});
		expectTypeOf(Prose).parameter(0).toEqualTypeOf<LayoutProps<string>>();
	});
});

describe('eco.embed on components inferred from render', () => {
	it('checks props and returns the inferred element type', () => {
		const Counter = eco.component({ render: ({ count }: { count: number }) => `<i>${count}</i>` });
		expectTypeOf<PropsOf<typeof Counter>>().toEqualTypeOf<{ count: number }>();
		expectTypeOf<ResultOf<typeof Counter>>().toEqualTypeOf<string>();
		expectTypeOf(eco.embed(Counter, { count: 1 })).toEqualTypeOf<string>();
		// @ts-expect-error wrong prop type
		eco.embed(Counter, { count: '1' });
	});

	it('takes children as the third argument when the component declares them', () => {
		const Card = eco.component({
			render: ({ children }: { children?: string }) => `<section>${children}</section>`,
		});
		expectTypeOf(eco.embed(Card, {}, 'inner')).toEqualTypeOf<string>();
	});
});
