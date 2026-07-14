import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { Breadcrumb, type BreadcrumbItem } from '@/components/breadcrumb/breadcrumb';
import { CopyForLlm } from '@/components/copy-for-llm';

export type DocsBarProps = {
	crumbs?: BreadcrumbItem[];
	llmUrl?: string;
	label?: string;
};

export const DocsBar = eco.component<DocsBarProps, JsxRenderable>({
	dependencies: {
		components: [Breadcrumb, CopyForLlm],
		stylesheets: ['./docs-bar.css'],
	},
	render: ({ crumbs = [], llmUrl, label }) => {
		return (
			<div class="docs-bar">
				{crumbs.length > 0 ? (
					<Breadcrumb class="docs-breadcrumb" items={crumbs} ariaLabel="Breadcrumb" />
				) : null}
				{llmUrl ? <CopyForLlm llmUrl={llmUrl} label={label} /> : null}
			</div>
		);
	},
});
