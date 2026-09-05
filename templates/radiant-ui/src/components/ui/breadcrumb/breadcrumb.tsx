/**
 * Breadcrumb — `@ecopages/radiant-ui/breadcrumb`.
 *
 * `Breadcrumb` owns this component's stylesheet and lazy script, so listing it
 * in a page or layout `dependencies.components` ships everything it needs.
 *
 * A trail is five primitives deep — list, item, link or page, and a separator
 * element between every pair — and the last crumb has to be a `RuiBreadcrumbPage`
 * rather than a link so it carries `aria-current="page"`.
 *
 * Pass `items` and all of that follows from the data: entries with an `href`
 * become links, the final entry becomes the current page, and separators land
 * between them.
 */
import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import {
	RuiBreadcrumb,
	RuiBreadcrumbEllipsis,
	RuiBreadcrumbItem,
	RuiBreadcrumbLink,
	RuiBreadcrumbList,
	RuiBreadcrumbPage,
	RuiBreadcrumbSeparator,
	type RuiBreadcrumbViewProps,
} from '@ecopages/radiant-ui/breadcrumb';

export type BreadcrumbItem = {
	label: JsxRenderable;
	/** Omit on the last crumb — it renders as the current page. */
	href?: string;
	/** Renders a collapsed-trail marker instead of a crumb. */
	ellipsis?: boolean;
};

export type BreadcrumbProps = Omit<RuiBreadcrumbViewProps, 'children'> & {
	/** The trail, root first. */
	items?: BreadcrumbItem[];
	children?: JsxRenderable;
};

function crumb(item: BreadcrumbItem, isLast: boolean): JsxRenderable {
	if (item.ellipsis) return <RuiBreadcrumbEllipsis />;
	if (item.href && !isLast) return <RuiBreadcrumbLink href={item.href}>{item.label}</RuiBreadcrumbLink>;
	return <RuiBreadcrumbPage>{item.label}</RuiBreadcrumbPage>;
}

export const Breadcrumb = eco.component<BreadcrumbProps, JsxRenderable>({
	dependencies: {
		stylesheets: ['./breadcrumb.css'],
		scripts: [{ src: './breadcrumb.script.ts', lazy: { 'on:idle': true } }],
	},
	render: ({ items, children, ...props }) => (
		<RuiBreadcrumb {...props}>
			{items ? (
				<RuiBreadcrumbList>
					{items.map((item, index) => (
						<>
							{index > 0 ? <RuiBreadcrumbSeparator /> : null}
							<RuiBreadcrumbItem>{crumb(item, index === items.length - 1)}</RuiBreadcrumbItem>
						</>
					))}
				</RuiBreadcrumbList>
			) : (
				children
			)}
		</RuiBreadcrumb>
	),
});
