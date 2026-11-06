import type { JsxRenderable } from '@ecopages/jsx';
import './breadcrumb.css';

export type BreadcrumbItem = {
	label: string;
	href?: string;
};

export type BreadcrumbProps = {
	items: BreadcrumbItem[];
	ariaLabel?: string;
	class?: string;
};

export function Breadcrumb({ items, ariaLabel = 'Breadcrumb', class: className }: BreadcrumbProps): JsxRenderable {
	return (
		<nav aria-label={ariaLabel} class={className}>
			<ol class="breadcrumb-list">
				{items.map((item, index) => {
					const isLast = index === items.length - 1;

					return (
						<li class="breadcrumb-item">
							{item.href && !isLast ? (
								<a href={item.href}>{item.label}</a>
							) : (
								<span aria-current={isLast ? 'page' : undefined}>{item.label}</span>
							)}
						</li>
					);
				})}
			</ol>
		</nav>
	);
}
