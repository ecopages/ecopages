import { describe, expect, test } from 'vitest';
import type { LayoutProps } from '../types/contracts.ts';
import { eco } from './eco.ts';

type Element = string;

describe('eco.page layout types', () => {
	test('accepts a plain function typed with LayoutProps', () => {
		const PlainLayout = ({ children }: LayoutProps<Element>) => `<main>${children}</main>`;

		const page = eco.page<{}, Element>({ layout: PlainLayout, render: () => '' });

		expect(page.config?.layouts).toEqual([PlainLayout]);
	});

	test('accepts an eco.layout() result and a layout entry with a props factory', () => {
		const WrappedLayout = eco.layout<Element>({ render: ({ children }) => `<main>${children}</main>` });
		const ProseLayout = ({ children, prose }: LayoutProps<Element> & { prose?: boolean }) =>
			`<main data-prose="${String(prose)}">${children}</main>`;

		const page = eco.page<{}, Element>({
			layout: [WrappedLayout, { component: ProseLayout, props: () => ({ prose: true }) }],
			render: () => '',
		});

		expect(page.config?.layouts).toEqual([WrappedLayout, ProseLayout]);
	});

	test('types extra eco.layout() props after the element type', () => {
		const ProseLayout = eco.layout<Element, LayoutProps<Element> & { prose?: boolean }>({
			render: ({ children, prose }) => `<main data-prose="${String(prose)}">${children}</main>`,
		});
		const GreetingLayout = eco.layout<Element, LayoutProps<Element> & { name: string }>({
			render: ({ children, name }) => `<main>${name}${children}</main>`,
		});

		expect(ProseLayout({ children: '', prose: true })).toBe('<main data-prose="true"></main>');
		eco.page<{}, Element>({ layout: ProseLayout, render: () => '' });
		eco.page<{}, Element>({ layout: { component: ProseLayout, props: () => ({ prose: true }) }, render: () => '' });
		// @ts-expect-error a required extra prop is not passed by eco.page({ layout })
		eco.page<{}, Element>({ layout: GreetingLayout, render: () => '' });
	});

	test('rejects a layout without children in its props', () => {
		const Header = ({ title }: { title: string }) => `<h1>${title}</h1>`;
		const ComponentHeader = eco.component<{ title: string }, Element>({
			render: ({ title }) => `<h1>${title}</h1>`,
		});

		// @ts-expect-error a layout must accept LayoutProps, which carry `children`
		eco.page<{}, Element>({ layout: Header, render: () => '' });
		// @ts-expect-error an eco.component() that does not take `children` is not a layout
		eco.page<{}, Element>({ layout: ComponentHeader, render: () => '' });
		// @ts-expect-error a layout entry's component must accept LayoutProps too
		eco.page<{}, Element>({ layout: [{ component: Header }], render: () => '' });

		expect(true).toBe(true);
	});
});
