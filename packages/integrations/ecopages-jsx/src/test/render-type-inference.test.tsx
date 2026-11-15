/** @jsxImportSource @ecopages/jsx */
import { eco } from '@ecopages/core';
import type { LayoutProps } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { describe, expectTypeOf, it } from 'vitest';

type CounterProps = { count: number };

const Counter = eco.component({
	render: ({ count }: CounterProps) => <span>{count}</span>,
});

describe('render-based type inference (Ecopages JSX)', () => {
	it('infers props and element type from an annotated render', () => {
		expectTypeOf(Counter).parameter(0).toEqualTypeOf<CounterProps>();
		expectTypeOf(Counter).returns.toEqualTypeOf<JsxRenderable>();
	});

	it('checks callers of an inferred component', () => {
		const ok = () => <Counter count={1} />;
		// @ts-expect-error wrong prop type
		const wrongType = () => <Counter count="1" />;
		// @ts-expect-error missing prop
		const missing = () => <Counter />;
		// @ts-expect-error unknown prop
		const unknown = () => <Counter count={1} extra />;
		void [ok, wrongType, missing, unknown];
	});

	it('leaves props as {} when render is not annotated', () => {
		const Loose = eco.component({ render: ({ anything }: { anything?: number }) => <i>{anything}</i> });
		const Unannotated = eco.component({ render: () => <i /> });
		expectTypeOf(Unannotated).parameter(0).toEqualTypeOf<{}>();
		expectTypeOf(Unannotated).returns.toEqualTypeOf<JsxRenderable>();
		// a direct call accepts any object because {} is the props type
		expectTypeOf(Unannotated({ whatever: 1 })).toEqualTypeOf<JsxRenderable>();
		// JSX rejects every prop, since the component declares none
		// @ts-expect-error nothing can be passed to a {} component in JSX
		const noProps = () => <Unannotated whatever={1} />;
		void [Loose, noProps];
		// @ts-expect-error props cannot be read from an unannotated render
		eco.component({ render: ({ count }) => <i>{count}</i> });
	});

	it('loses element inference with one explicit type argument', () => {
		// @ts-expect-error E falls back to EcoPagesElement (string), so a JSX render does not fit
		eco.component<CounterProps>({ render: ({ count }) => <span>{count}</span> });
		const WithString = eco.component<CounterProps>({ render: ({ count }) => `${count}` });
		expectTypeOf(WithString).returns.toEqualTypeOf<string | Promise<string>>();
	});

	it('accepts both explicit type arguments', () => {
		const Both = eco.component<CounterProps, JsxRenderable>({ render: ({ count }) => <span>{count}</span> });
		expectTypeOf(Both).parameter(0).toEqualTypeOf<CounterProps>();
		expectTypeOf(Both).returns.toEqualTypeOf<JsxRenderable>();
		// @ts-expect-error wrong prop
		const bad = () => <Both count="x" />;
		void bad;
	});

	it('infers from an async render', () => {
		const Async = eco.component({ render: async ({ count }: CounterProps) => <span>{count}</span> });
		expectTypeOf(Async).parameter(0).toEqualTypeOf<CounterProps>();
		expectTypeOf(Async).returns.toEqualTypeOf<JsxRenderable>();
	});

	it('infers when render embeds another Eco Component', () => {
		const Wrapper = eco.component({ render: ({ count }: CounterProps) => <Counter count={count} /> });
		expectTypeOf(Wrapper).parameter(0).toEqualTypeOf<CounterProps>();
		// @ts-expect-error wrong prop reaches the inner component
		eco.component({ render: ({ count }: CounterProps) => <Counter count={`${count}`} /> });
	});

	it('infers children props', () => {
		type CardProps = { title: string; children?: JsxRenderable };
		const Card = eco.component({
			render: ({ title, children }: CardProps) => (
				<section>
					{title}
					{children}
				</section>
			),
		});
		expectTypeOf(Card).parameter(0).toEqualTypeOf<CardProps>();
		const ok = () => (
			<Card title="a">
				<b />
			</Card>
		);
		const bad = () => (
			// @ts-expect-error title is required
			<Card>
				<b />
			</Card>
		);
		void [ok, bad];
	});
});

describe('render-based type inference for pages, layouts and html (Ecopages JSX)', () => {
	it('infers page props from props and the element type from render', () => {
		const Page = eco.page({
			props: async () => ({
				title: 'x',
			}),
			metadata: ({ props }) => ({ title: props.title, description: 'd' }),
			render: ({ title }) => <h1>{title}</h1>,
		});
		expectTypeOf(Page.props).not.toBeAny();
		expectTypeOf(Page).parameter(0).toMatchObjectType<{ title: string }>();
	});

	it('checks an annotated page render against props', () => {
		eco.page({
			props: async () => ({
				title: 'x',
			}),
			// @ts-expect-error render props disagree with the props return
			render: ({ title }: { title: number }) => <h1>{title}</h1>,
		});
	});

	it('gives route params to a page without props', () => {
		eco.page({ render: async ({ params }) => <h1>{params?.slug}</h1> });
	});

	it('loses element inference with one explicit page type argument', () => {
		eco.page<{ title: string }>({
			props: async () => ({
				title: 'x',
			}),
			// @ts-expect-error E falls back to EcoPagesElement, so a JSX render does not fit
			render: ({ title }) => <h1>{title}</h1>,
		});
		eco.page<{ title: string }, JsxRenderable>({
			props: async () => ({
				title: 'x',
			}),
			render: ({ title }) => <h1>{title}</h1>,
		});
	});

	it('accepts layouts typed with the same renderable', () => {
		const Layout = eco.layout({ render: ({ children }: LayoutProps<JsxRenderable>) => <main>{children}</main> });
		expectTypeOf(Layout).returns.toEqualTypeOf<JsxRenderable>();
		eco.page({ layout: Layout, render: () => <h1 /> });
		eco.page({
			layout: ({ children }: LayoutProps<JsxRenderable>) => <main>{children}</main>,
			render: () => <h1 />,
		});
		eco.page({
			layout: ({ children }: LayoutProps<string>) => `<main>${children}</main>`,
			// @ts-expect-error a string layout makes E a string, so the JSX render does not fit
			render: () => <h1 />,
		});
	});

	it('cannot infer the layout element type from an unannotated render', () => {
		// @ts-expect-error children is typed with the default EcoPagesElement before render is inspected
		eco.layout({ render: ({ children }) => <main>{children}</main> });
		eco.layout<JsxRenderable>({ render: ({ children }) => <main>{children}</main> });
	});

	it('types extra layout props with both type arguments', () => {
		const Prose = eco.layout<JsxRenderable, LayoutProps<JsxRenderable> & { prose?: boolean }>({
			render: ({ children, prose }) => <main data-prose={prose}>{children}</main>,
		});
		eco.page({ layout: { component: Prose, props: () => ({ prose: true }) }, render: () => <h1 /> });
	});

	it('infers eco.html from an annotated render and types it with one argument', () => {
		eco.html<JsxRenderable>({
			render: ({ children, headContent }) => (
				<html>
					<head>{headContent}</head>
					<body>{children}</body>
				</html>
			),
		});
		// @ts-expect-error unannotated props default to EcoPagesElement
		eco.html({ render: ({ children }) => <html>{children}</html> });
	});
});

describe('render-based type inference for Radiant hosts (Ecopages JSX)', () => {
	it('infers props and element type from a render that emits a Radiant host', () => {
		type RadiantCounterProps = { value?: number };
		const RadiantCounter = eco.component({
			render: ({ value = 0 }: RadiantCounterProps) => (
				<radiant-counter attr:value={value}>
					<span data-ref="count">{value}</span>
				</radiant-counter>
			),
		});
		expectTypeOf(RadiantCounter).parameter(0).toEqualTypeOf<RadiantCounterProps>();
		expectTypeOf(RadiantCounter).returns.toEqualTypeOf<JsxRenderable>();
		const ok = () => <RadiantCounter value={2} />;
		// @ts-expect-error value is a number
		const bad = () => <RadiantCounter value="2" />;
		void [ok, bad];
	});
});
