import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { docsNav } from '@/lib/content-nav';
import './navigation.script';

const DocsNavigation = () => {
	return (
		<nav aria-label="Main Navigation">
			<ul class="docs-layout__nav-list">
				{docsNav.sections.map((group, index) => (
					<li>
						{index > 0 ? <div class="docs-layout__nav-separator" role="presentation" /> : null}
						<div class="docs-layout__nav-group">
							<span class="docs-layout__nav-group-icon">{group.icon}</span>
							<span safe>{group.title}</span>
						</div>
						<ul class="docs-layout__nav-group-list">
							{group.items.map((page) => (
								<li>
									<a href={page.href} data-nav-link data-testid={`docs-nav-link:${page.href}`} safe>
										{page.title}
									</a>
								</li>
							))}
						</ul>
					</li>
				))}
			</ul>
		</nav>
	);
};

export const DocsSidebar = eco.component<Record<string, never>, JsxRenderable>({
	dependencies: {
		scripts: ['./navigation.script.ts'],
	},
	render: () => {
		return (
			<radiant-navigation
				class="docs-layout__aside hidden md:block"
				data-eco-persist="docs-sidebar"
				data-testid="docs-sidebar"
			>
				<DocsNavigation />
			</radiant-navigation>
		);
	},
});
