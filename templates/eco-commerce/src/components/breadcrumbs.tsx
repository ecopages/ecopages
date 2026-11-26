import type { JsxRenderable } from '@ecopages/jsx';
import {
	RuiBreadcrumb,
	RuiBreadcrumbItem,
	RuiBreadcrumbLink,
	RuiBreadcrumbList,
	RuiBreadcrumbPage,
	RuiBreadcrumbSeparator,
} from '@ecopages/radiant-ui/breadcrumb';

export type Crumb = {
	label: string;
	href?: string;
};

/** The trail to the current page; the last crumb, without `href`, is the page itself. */
export function Breadcrumbs({ crumbs }: { crumbs: Crumb[] }): JsxRenderable {
	return (
		<RuiBreadcrumb class="breadcrumbs">
			<RuiBreadcrumbList>
				{crumbs.map((crumb, index) => (
					<>
						{index > 0 ? <RuiBreadcrumbSeparator /> : null}
						<RuiBreadcrumbItem>
							{crumb.href ? (
								<RuiBreadcrumbLink href={crumb.href}>{crumb.label}</RuiBreadcrumbLink>
							) : (
								<RuiBreadcrumbPage>{crumb.label}</RuiBreadcrumbPage>
							)}
						</RuiBreadcrumbItem>
					</>
				))}
			</RuiBreadcrumbList>
		</RuiBreadcrumb>
	);
}
