import type { JsxRenderable } from '@ecopages/jsx';
import {
	RuiBreadcrumb,
	RuiBreadcrumbItem,
	RuiBreadcrumbLink,
	RuiBreadcrumbList,
	RuiBreadcrumbPage,
	RuiBreadcrumbSeparator,
} from '@ecopages/radiant-ui/breadcrumb';

/**
 * A Radiant UI breadcrumb: links for the trail, then the current page.
 */
export function StoreBreadcrumb({
	trail,
	current,
}: {
	trail: Array<{ label: string; href: string }>;
	current: string;
}): JsxRenderable {
	return (
		<RuiBreadcrumb class="store-breadcrumb">
			<RuiBreadcrumbList>
				{trail.map((crumb) => (
					<>
						<RuiBreadcrumbItem>
							<RuiBreadcrumbLink href={crumb.href}>{crumb.label}</RuiBreadcrumbLink>
						</RuiBreadcrumbItem>
						<RuiBreadcrumbSeparator />
					</>
				))}
				<RuiBreadcrumbItem>
					<RuiBreadcrumbPage>{current}</RuiBreadcrumbPage>
				</RuiBreadcrumbItem>
			</RuiBreadcrumbList>
		</RuiBreadcrumb>
	);
}
