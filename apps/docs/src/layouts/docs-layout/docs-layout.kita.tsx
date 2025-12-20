import type { EcoComponent } from '@ecopages/core';
import { ApiField } from '@/components/api-field/api-field.kita';
import { CodeBlock } from '@/components/code-block/code-block.kita';
import { docsConfig } from '@/data/docs-config';
import { BaseLayout } from '@/layouts/base-layout';

export type DocsLayoutProps = {
	children: JSX.Element;
	class?: string;
};

const getGroupIcon = (name: string) => {
	switch (name) {
		case 'Getting Started':
			return (
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="20"
					height="20"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					class="icon icon-tabler icons-tabler-outline icon-tabler-code"
				>
					<path stroke="none" d="M0 0h24v24H0z" fill="none" />
					<path d="M7 8l-4 4l4 4" />
					<path d="M17 8l4 4l-4 4" />
					<path d="M14 4l-4 16" />
				</svg>
			);
		case 'Core':
			return (
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					class="icon icon-tabler icons-tabler-outline icon-tabler-settings"
				>
					<path stroke="none" d="M0 0h24v24H0z" fill="none" />
					<path d="M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065z" />
					<path d="M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" />
				</svg>
			);
		case 'Integrations':
			return (
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					class="icon icon-tabler icons-tabler-outline icon-tabler-cube-plus"
				>
					<path stroke="none" d="M0 0h24v24H0z" fill="none" />
					<path d="M21 12.5v-4.509a1.98 1.98 0 0 0 -1 -1.717l-7 -4.008a2.016 2.016 0 0 0 -2 0l-7 4.007c-.619 .355 -1 1.01 -1 1.718v8.018c0 .709 .381 1.363 1 1.717l7 4.008a2.016 2.016 0 0 0 2 0" />
					<path d="M12 22v-10" />
					<path d="M12 12l8.73 -5.04" />
					<path d="M3.27 6.96l8.73 5.04" />
					<path d="M16 19h6" />
					<path d="M19 16v6" />
				</svg>
			);
		case 'Ecosystem':
			return (
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					class="icon icon-tabler icons-tabler-outline icon-tabler-world"
				>
					<path stroke="none" d="M0 0h24v24H0z" fill="none" />
					<path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0" />
					<path d="M3.6 9h16.8" />
					<path d="M3.6 15h16.8" />
					<path d="M11.5 3a17 17 0 0 0 0 18" />
					<path d="M12.5 3a17 17 0 0 1 0 18" />
				</svg>
			);
		case 'Plugins':
			return (
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					class="icon icon-tabler icons-tabler-outline icon-tabler-plug"
				>
					<path stroke="none" d="M0 0h24v24H0z" fill="none" />
					<path d="M9.785 6l8.215 8.215l-2.054 2.054a5.81 5.81 0 1 1 -8.215 -8.215l2.054 -2.054z" />
					<path d="M4 20l3.5 -3.5" />
					<path d="M15 4l-3.5 3.5" />
					<path d="M20 9l-3.5 3.5" />
				</svg>
			);
		default:
			return null;
	}
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
											<a href={href} data-nav-link safe>
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

export const DocsLayout: EcoComponent<DocsLayoutProps> = ({ children }) => {
	return (
		<BaseLayout class="docs-layout prose">
			<>
				<radiant-navigation class="docs-layout__aside hidden md:block">
					<DocsNavigation />
				</radiant-navigation>
				<div class="docs-layout__content">{children}</div>
			</>
		</BaseLayout>
	);
};

DocsLayout.config = {
	dependencies: {
		stylesheets: ['./docs-layout.css'],
		scripts: ['./docs-layout.script.ts'],
		components: [BaseLayout, CodeBlock, ApiField],
	},
};
