import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import type { BreadcrumbItem } from '@/components/breadcrumb/breadcrumb';
import { CopyForLlm } from '@/components/copy-for-llm';
import './docs-bar.css';

export type DocsBarProps = {
	crumbs?: BreadcrumbItem[];
	llmUrl?: string;
	label?: string;
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
	render: ({ crumbs = [], llmUrl, label }) => {
		return (
			<div class="docs-bar">
				{crumbs.length > 0 ? <DocsBreadcrumb crumbs={crumbs} /> : null}
				{llmUrl ? <CopyForLlm llmUrl={llmUrl} label={label} /> : null}
			</div>
		);
	},
});
