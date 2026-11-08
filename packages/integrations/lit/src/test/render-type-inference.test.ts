import { eco } from '@ecopages/core';
import type { LayoutProps } from '@ecopages/core';
import { html } from 'lit';
import type { TemplateResult } from 'lit';
import { describe, expectTypeOf, it } from 'vitest';

type CounterProps = { count: number };

const Counter = eco.component({
	render: ({ count }: CounterProps) => html`<span>${count}</span>`,
});

describe('render-based type inference (Lit)', () => {
	it('infers props and element type from an annotated render', () => {
		expectTypeOf(Counter).parameter(0).toEqualTypeOf<CounterProps>();
		expectTypeOf(Counter).returns.toEqualTypeOf<TemplateResult<1>>();
	});

	it('checks direct callers of an inferred component', () => {
		Counter({ count: 1 });
		// @ts-expect-error wrong prop type
		Counter({ count: '1' });
		// @ts-expect-error missing prop
		Counter({});
		// @ts-expect-error unknown prop
		Counter({ count: 1, extra: true });
	});

	it('leaves props as {} when render is not annotated', () => {
		const Unannotated = eco.component({ render: () => html`<i></i>` });
		expectTypeOf(Unannotated).parameter(0).toEqualTypeOf<{}>();
		expectTypeOf(Unannotated).returns.toEqualTypeOf<TemplateResult<1>>();
		// {} accepts any object, so nothing is checked
		Unannotated({ whatever: 1 });
		// @ts-expect-error props cannot be read from an unannotated render
		eco.component({ render: ({ count }) => html`<i>${count}</i>` });
	});

	it('loses element inference with one explicit type argument', () => {
		// @ts-expect-error E falls back to EcoPagesElement (string), so a template result does not fit
		eco.component<CounterProps>({ render: ({ count }) => html`<span>${count}</span>` });
		const WithString = eco.component<CounterProps>({ render: ({ count }) => `${count}` });
		expectTypeOf(WithString).returns.toEqualTypeOf<string | Promise<string>>();
	});

	it('accepts both explicit type arguments', () => {
		const Both = eco.component<CounterProps, TemplateResult>({
			render: ({ count }) => html`<span>${count}</span>`,
		});
		expectTypeOf(Both).parameter(0).toEqualTypeOf<CounterProps>();
		expectTypeOf(Both).returns.toEqualTypeOf<TemplateResult>();
		// @ts-expect-error wrong prop
		Both({ count: 'x' });
	});

	it('infers from an async render', () => {
		const Async = eco.component({ render: async ({ count }: CounterProps) => html`<span>${count}</span>` });
		expectTypeOf(Async).parameter(0).toEqualTypeOf<CounterProps>();
		expectTypeOf(Async).returns.toEqualTypeOf<TemplateResult<1>>();
	});

	it('infers when render embeds another Eco Component', () => {
		const Wrapper = eco.component({ render: ({ count }: CounterProps) => html`<div>${Counter({ count })}</div>` });
		expectTypeOf(Wrapper).parameter(0).toEqualTypeOf<CounterProps>();
		// @ts-expect-error wrong prop reaches the inner component
		eco.component({ render: ({ count }: CounterProps) => html`<div>${Counter({ count: `${count}` })}</div>` });
	});

	it('infers children props', () => {
		type CardProps = { title: string; children?: TemplateResult };
		const Card = eco.component({
			render: ({ title, children }: CardProps) => html`<section>${title}${children}</section>`,
		});
		expectTypeOf(Card).parameter(0).toEqualTypeOf<CardProps>();
		Card({ title: 'a', children: html`<b></b>` });
		// @ts-expect-error title is required
		Card({ children: html`<b></b>` });
	});
});

describe('render-based type inference for pages, layouts and html (Lit)', () => {
	it('infers page props from staticProps and the element type from render', () => {
		const Page = eco.page({
			staticProps: async () => ({ props: { title: 'x' } }),
			metadata: ({ props }) => ({ title: props.title, description: 'd' }),
			render: ({ title }) => html`<h1>${title}</h1>`,
		});
		expectTypeOf(Page).parameter(0).toMatchObjectType<{ title: string }>();
	});

	it('checks an annotated page render against staticProps', () => {
		eco.page({
			staticProps: async () => ({ props: { title: 'x' } }),
			// @ts-expect-error render props disagree with the staticProps return
			render: ({ title }: { title: number }) => html`<h1>${title}</h1>`,
		});
	});

	it('gives route params to a page without staticProps', () => {
		eco.page({ render: async ({ params }) => html`<h1>${params?.slug}</h1>` });
	});

	it('loses element inference with one explicit page type argument', () => {
		eco.page<{ title: string }>({
			staticProps: async () => ({ props: { title: 'x' } }),
			// @ts-expect-error E falls back to EcoPagesElement, so a template result does not fit
			render: ({ title }) => html`<h1>${title}</h1>`,
		});
		eco.page<{ title: string }, TemplateResult>({
			staticProps: async () => ({ props: { title: 'x' } }),
			render: ({ title }) => html`<h1>${title}</h1>`,
		});
	});

	it('accepts layouts typed with the same renderable', () => {
		const Layout = eco.layout({
			render: ({ children }: LayoutProps<TemplateResult>) => html`<main>${children}</main>`,
		});
		eco.page({ layout: Layout, render: () => html`<h1></h1>` });
		eco.page({
			layout: ({ children }: LayoutProps<TemplateResult>) => html`<main>${children}</main>`,
			render: () => html`<h1></h1>`,
		});
		eco.page({
			layout: ({ children }: LayoutProps<string>) => `<main>${children}</main>`,
			// @ts-expect-error a string layout makes E a string, so the template render does not fit
			render: () => html`<h1></h1>`,
		});
	});

	it('cannot infer the layout element type from an unannotated render', () => {
		const Inferred = eco.layout({ render: ({ children }) => html`<main>${children}</main>` });
		expectTypeOf(Inferred).parameter(0).toHaveProperty('children').toEqualTypeOf<string | Promise<string>>();
		// @ts-expect-error children is a string here, so this layout does not fit a template page
		eco.page({ layout: Inferred, render: () => html`<h1></h1>` });
		eco.layout<TemplateResult>({ render: ({ children }) => html`<main>${children}</main>` });
	});

	it('types eco.html with one argument', () => {
		eco.html<TemplateResult>({
			render: ({ children, headContent }) =>
				html`<html>
					<head>
						${headContent}
					</head>
					<body>
						${children}
					</body>
				</html>`,
		});
	});
});
