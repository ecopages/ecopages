import type { EcoComponent } from '@ecopages/core';

export type BreadcrumbItem = {
	label: string;
	href?: string;
};

export type BreadcrumbProps = {
	items: BreadcrumbItem[];
	ariaLabel?: string;
	showHome?: boolean;
};

export const Breadcrumb: EcoComponent<BreadcrumbProps> = ({ items, ariaLabel = 'Breadcrumb', showHome }) => {
	return (
		<nav aria-label={ariaLabel}>
			<ol class="breadcrumb-list">
				{showHome && (
					<li class="breadcrumb-item">
						<a class="button button--text" aria-label="Go to Home" title="Go to Home" href="/">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="24"
								height="24"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
							>
								<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" />
								<path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
							</svg>
							Home
						</a>
					</li>
				)}
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
};

Breadcrumb.config = {
	dependencies: {
		stylesheets: ['./breadcrumb.css'],
	},
};
