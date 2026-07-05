import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import '@/docs-kit.instance';
import { getDocsKit } from '@/lib/docs-kit/config';
import { getSectionIcon } from '../../get-section-icon';
import './navigation.script';

const DocsNavigation = () => {
	const { manifest } = getDocsKit();

	return (
		<nav aria-label="Main Navigation">
			<ul class="docs-layout__nav-list">
				{manifest.sections.map((group, index) => (
					<li>
						{index > 0 ? <div class="docs-layout__nav-separator" role="presentation" /> : null}
						<div class="docs-layout__nav-group">
							<span class="docs-layout__nav-group-icon">{getSectionIcon(group.id)}</span>
							<span safe>{group.title}</span>
						</div>
						<ul class="docs-layout__nav-group-list">
							{group.pages.map((page) => {
								const href = `${manifest.rootDir}/${page.section}/${page.slug}`;

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
