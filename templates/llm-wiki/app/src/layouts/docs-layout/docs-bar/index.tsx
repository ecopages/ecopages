import { eco } from '@ecopages/core';
import type { JsxCustomElementAttributes, JsxRenderable } from '@ecopages/jsx';

export type BreadcrumbItem = {
	label: string;
	href?: string;
};

export type DocsBarProps = {
	crumbs?: BreadcrumbItem[];
};

const DocsBreadcrumb = ({ crumbs }: { crumbs: BreadcrumbItem[] }) => (
	<rui-breadcrumb class="docs-breadcrumb" label="Page location">
		<ol class="rui-breadcrumb__list">
			{crumbs.map((crumb, index) => {
				const isLast = index === crumbs.length - 1;

				return (
					<>
						{index > 0 ? (
							<li class="rui-breadcrumb__separator" role="presentation" aria-hidden="true" />
						) : null}
						<li class="rui-breadcrumb__item">
							{crumb.href && !isLast ? (
								<a class="rui-breadcrumb__link" href={crumb.href}>
									{crumb.label}
								</a>
							) : (
								<span class="rui-breadcrumb__page" aria-current="page">
									{crumb.label}
								</span>
							)}
						</li>
					</>
				);
			})}
		</ol>
	</rui-breadcrumb>
);

export const DocsBar = eco.component<DocsBarProps, JsxRenderable>({
	dependencies: {
		stylesheets: ['./docs-bar.css'],
	},
	render: ({ crumbs = [] }) => {
		return <div class="docs-bar">{crumbs.length > 0 ? <DocsBreadcrumb crumbs={crumbs} /> : null}</div>;
	},
});

declare module '@ecopages/jsx' {
	interface JsxCustomIntrinsicElements {
		'rui-breadcrumb': JsxCustomElementAttributes<HTMLElement, { label?: string }>;
	}
}
