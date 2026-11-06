import {
	RuiBreadcrumb,
	RuiBreadcrumbItem,
	RuiBreadcrumbLink,
	RuiBreadcrumbList,
	RuiBreadcrumbPage,
	RuiBreadcrumbSeparator,
} from '@ecopages/radiant-ui/breadcrumb';
import { DEV_ROOT } from '@/content/dev';
import { ECOPAGES_GITHUB } from '@/lib/docs/site-meta';

/** Breadcrumb of a developer page: Home, Developers, then the page title when there is one. */
export const DevBreadcrumb = ({ title }: { title?: string }) => (
	<div class="unstyled">
		<RuiBreadcrumb label="Page location">
			<RuiBreadcrumbList>
				<RuiBreadcrumbItem>
					<RuiBreadcrumbLink href="/">Home</RuiBreadcrumbLink>
				</RuiBreadcrumbItem>
				<RuiBreadcrumbSeparator />
				<RuiBreadcrumbItem>
					{title ? (
						<RuiBreadcrumbLink href={DEV_ROOT}>Developers</RuiBreadcrumbLink>
					) : (
						<RuiBreadcrumbPage>Developers</RuiBreadcrumbPage>
					)}
				</RuiBreadcrumbItem>
				{title ? (
					<>
						<RuiBreadcrumbSeparator />
						<RuiBreadcrumbItem>
							<RuiBreadcrumbPage>{title}</RuiBreadcrumbPage>
						</RuiBreadcrumbItem>
					</>
				) : null}
			</RuiBreadcrumbList>
		</RuiBreadcrumb>
	</div>
);

/** Lists the `sources:` of a developer page, each linked to the `next` branch on GitHub. */
export const DevSources = ({ sources }: { sources: string[] }) => (
	<>
		<h2 id="sources">Sources</h2>
		<p>
			This page describes the code below. A pull request that changes these paths updates this page in the same
			pull request.
		</p>
		<ul>
			{sources.map((source) => (
				<li>
					<a href={`${ECOPAGES_GITHUB}/${source.endsWith('/') ? 'tree' : 'blob'}/next/${source}`}>
						<code>{source}</code>
					</a>
				</li>
			))}
		</ul>
	</>
);
