import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import {
	RuiBreadcrumb,
	RuiBreadcrumbItem,
	RuiBreadcrumbLink,
	RuiBreadcrumbList,
	RuiBreadcrumbPage,
	RuiBreadcrumbSeparator,
} from '@ecopages/radiant-ui/breadcrumb';
import { CopyForLlm } from '@/components/copy-for-llm';
import type { DocsCrumb } from '@/lib/docs/docs-crumbs';
import './docs-bar.css';

export type DocsBarProps = {
	crumbs?: DocsCrumb[];
	llmUrl?: string;
	label?: string;
};

const DocsBreadcrumb = ({ crumbs }: { crumbs: DocsCrumb[] }) => (
	<div class="docs-breadcrumb">
		<RuiBreadcrumb label="Page location">
			<RuiBreadcrumbList>
				{crumbs.map((crumb, index) => {
					const isLast = index === crumbs.length - 1;

					return (
						<>
							{index > 0 ? <RuiBreadcrumbSeparator /> : null}
							<RuiBreadcrumbItem>
								{crumb.href && !isLast ? (
									<RuiBreadcrumbLink href={crumb.href}>{crumb.label}</RuiBreadcrumbLink>
								) : (
									<RuiBreadcrumbPage>{crumb.label}</RuiBreadcrumbPage>
								)}
							</RuiBreadcrumbItem>
						</>
					);
				})}
			</RuiBreadcrumbList>
		</RuiBreadcrumb>
	</div>
);

/** The single place that composes the page breadcrumb with Copy for LLM. */
export const DocsBar = eco.component<DocsBarProps, JsxRenderable>({
	dependencies: { components: [CopyForLlm] },
	render: ({ crumbs = [], llmUrl, label }) => {
		if (crumbs.length === 0 && !llmUrl) {
			return null;
		}

		return (
			<div class="docs-bar">
				{crumbs.length > 0 ? <DocsBreadcrumb crumbs={crumbs} /> : null}
				{llmUrl ? <CopyForLlm llmUrl={llmUrl} label={label} /> : null}
			</div>
		);
	},
});
