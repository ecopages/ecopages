import type { EcoComponent } from '@ecopages/core';
import { ApiField } from '@/components/api-field/api-field.kita';
import { docsConfig } from '@/data/docs-config';
import { BaseLayout } from '@/layouts/base-layout';
import { Banner } from '@/components/banner/banner.kita';
import { getGroupIcon } from './get-group-icon.kita';
import { CodeSnippetTabs } from '@/components/code-snippet-tabs/code-snippet-tabs.kita';

export type DocsLayoutProps = {
	children: JSX.Element;
	class?: string;
};

const DocsNavigation = () => {
	return (
		<nav aria-label="Main Navigation">
			<ul class="docs-layout__nav-list">
				{docsConfig.documents.map((group, index) => (
					<>
						{index > 0 && <li class="docs-layout__nav-separator" />}
						<li>
							<div class="docs-layout__nav-group">
								<span class="docs-layout__nav-group-icon">{getGroupIcon(group.name)}</span>
								<span safe>{group.name}</span>
							</div>
							<ul class="docs-layout__nav-group-list">
								{group.pages.map((page) => {
									const href = group.subdirectory
										? `${docsConfig.settings.rootDir}/${group.subdirectory}/${page.slug}`
										: `${docsConfig.settings.rootDir}/${page.slug}`;
									return (
										<li>
											<a href={href} data-nav-link data-testid={`docs-nav-link:${href}`} safe>
												{page.title}
											</a>
										</li>
									);
								})}
							</ul>
						</li>
					</>
				))}
			</ul>
		</nav>
	);
};

export const DocsLayout: EcoComponent<DocsLayoutProps> = ({ children, class: className }) => {
	return (
		<BaseLayout class={`docs-layout ${className ?? ''}`.trim()}>
			<>
				<radiant-navigation
					class="docs-layout__aside hidden md:block"
					data-eco-persist="docs-sidebar"
					data-testid="docs-sidebar"
				>
					<DocsNavigation />
				</radiant-navigation>
				<div class="docs-layout__content">
					<div class="prose">{children}</div>
					<radiant-docs-pagination class="docs-layout__pagination"></radiant-docs-pagination>
				</div>
				<radiant-toc class="docs-layout__toc"></radiant-toc>
			</>
		</BaseLayout>
	);
};

DocsLayout.config = {
	dependencies: {
		stylesheets: ['./docs-layout.css'],
		scripts: ['./docs-layout.script.ts'],
		components: [BaseLayout, ApiField, Banner, CodeSnippetTabs],
	},
};
