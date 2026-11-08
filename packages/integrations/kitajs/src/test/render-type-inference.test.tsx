/** @jsxImportSource @kitajs/html */
import { eco } from '@ecopages/core';
import type { LayoutProps } from '@ecopages/core';
import type { EcoPagesElement } from '@ecopages/core';
import { describe, expectTypeOf, it } from 'vitest';

type CounterProps = { count: number };

const Counter = eco.component({
	render: ({ count }: CounterProps) => <span>{count}</span>,
});

describe('render-based type inference (Kita)', () => {
	it('infers props and element type from an annotated render', () => {
		expectTypeOf(Counter).parameter(0).toEqualTypeOf<CounterProps>();
		expectTypeOf(Counter).returns.toEqualTypeOf<string>();
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
		expectTypeOf(Unannotated).returns.toEqualTypeOf<string>();
		// a direct call accepts any object because {} is the props type
		expectTypeOf(Unannotated({ whatever: 1 })).toEqualTypeOf<string>();
		// JSX rejects every prop, since the component declares none
		// @ts-expect-error nothing can be passed to a {} component in JSX
		const noProps = () => <Unannotated whatever={1} />;
		void [Loose, noProps];
		// @ts-expect-error props cannot be read from an unannotated render
		eco.component({ render: ({ count }) => <i>{count}</i> });
	});

	it('keeps working with one explicit type argument because Kita JSX is a string', () => {
		const WithJsx = eco.component<CounterProps>({ render: ({ count }) => <span>{count}</span> });
		expectTypeOf(WithJsx).parameter(0).toEqualTypeOf<CounterProps>();
		// the default EcoPagesElement is wider than the string Kita JSX produces
		expectTypeOf(WithJsx).returns.toEqualTypeOf<EcoPagesElement>();
		const WithString = eco.component<CounterProps>({ render: ({ count }) => `${count}` });
		expectTypeOf(WithString).returns.toEqualTypeOf<string | Promise<string>>();
	});

	it('accepts both explicit type arguments', () => {
		const Both = eco.component<CounterProps, EcoPagesElement>({ render: ({ count }) => <span>{count}</span> });
		expectTypeOf(Both).parameter(0).toEqualTypeOf<CounterProps>();
		expectTypeOf(Both).returns.toEqualTypeOf<EcoPagesElement>();
		// @ts-expect-error wrong prop
		const bad = () => <Both count="x" />;
		void bad;
	});

	it('infers from an async render', () => {
		const Async = eco.component({ render: async ({ count }: CounterProps) => <span>{count}</span> });
		expectTypeOf(Async).parameter(0).toEqualTypeOf<CounterProps>();
		expectTypeOf(Async).returns.toEqualTypeOf<string>();
	});

	it('infers when render embeds another Eco Component', () => {
		const Wrapper = eco.component({ render: ({ count }: CounterProps) => <Counter count={count} /> });
		expectTypeOf(Wrapper).parameter(0).toEqualTypeOf<CounterProps>();
		// @ts-expect-error wrong prop reaches the inner component
		eco.component({ render: ({ count }: CounterProps) => <Counter count={`${count}`} /> });
	});

	it('infers children props', () => {
		type CardProps = { title: string; children?: EcoPagesElement };
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

describe('render-based type inference for pages, layouts and html (Kita)', () => {
	it('infers page props from staticProps and the element type from render', () => {
		const Page = eco.page({
			staticProps: async () => ({ props: { title: 'x' } }),
			metadata: ({ props }) => ({ title: props.title, description: 'd' }),
			render: ({ title }) => <h1>{title}</h1>,
		});
		expectTypeOf(Page.staticProps).not.toBeAny();
		expectTypeOf(Page).parameter(0).toMatchObjectType<{ title: string }>();
	});

	it('checks an annotated page render against staticProps', () => {
		// @ts-expect-error render props disagree with the staticProps return
		eco.page({
			staticProps: async () => ({ props: { title: 'x' } }),
			render: ({ title }: { title: number }) => <h1>{title}</h1>,
		});
	});

	it('gives route params to a page without staticProps', () => {
		eco.page({ render: async ({ params }) => <h1>{params?.slug}</h1> });
	});

	it('keeps working with one explicit page type argument because Kita JSX is a string', () => {
		eco.page<{ title: string }>({
			staticProps: async () => ({ props: { title: 'x' } }),
			render: ({ title }) => <h1>{title}</h1>,
		});
		eco.page<{ title: string }, EcoPagesElement>({
			staticProps: async () => ({ props: { title: 'x' } }),
			render: ({ title }) => <h1>{title}</h1>,
		});
	});

	it('accepts layouts typed with the same renderable', () => {
		const Layout = eco.layout({ render: ({ children }: LayoutProps<EcoPagesElement>) => <main>{children}</main> });
		expectTypeOf(Layout).returns.toEqualTypeOf<string>();
		eco.page({ layout: Layout, render: () => <h1 /> });
		eco.page({
			layout: ({ children }: LayoutProps<EcoPagesElement>) => <main>{children}</main>,
			render: () => <h1 />,
		});
		eco.page({ layout: ({ children }: LayoutProps<string>) => `<main>${children}</main>`, render: () => <h1 /> });
	});

	it('types an unannotated layout through the EcoPagesElement default', () => {
		const Inferred = eco.layout({ render: ({ children }) => <main>{children}</main> });
		expectTypeOf(Inferred).parameter(0).toHaveProperty('children').toEqualTypeOf<EcoPagesElement>();
		eco.layout<EcoPagesElement>({ render: ({ children }) => <main>{children}</main> });
	});

	it('types extra layout props with both type arguments', () => {
		const Prose = eco.layout<EcoPagesElement, LayoutProps<EcoPagesElement> & { prose?: boolean }>({
			render: ({ children, prose }) => <main data-prose={prose}>{children}</main>,
		});
		eco.page({ layout: { component: Prose, props: () => ({ prose: true }) }, render: () => <h1 /> });
	});

	it('infers eco.html from an annotated render and types it with one argument', () => {
		eco.html<EcoPagesElement>({
			render: ({ children, headContent }) => (
				<html>
					<head>{headContent}</head>
					<body>{children}</body>
				</html>
			),
		});
		eco.html({ render: ({ children }) => <html>{children}</html> });
	});
});
