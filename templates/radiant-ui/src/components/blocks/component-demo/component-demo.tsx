/**
 * ComponentDemo — one labelled specimen in the catalog.
 *
 * The catalog is a long page of unrelated widgets, so each needs a frame that
 * says what it is and keeps its own margins from bleeding into the next. The
 * `id` doubles as the anchor the catalog's index links to.
 */
import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';

export type ComponentDemoProps = {
	/** Anchor target, matching the component's directory name. */
	id: string;
	name: string;
	/** One line on what the composed component does for you. */
	summary: JsxRenderable;
	children?: JsxRenderable;
};

export const ComponentDemo = eco.component<ComponentDemoProps, JsxRenderable>({
	dependencies: { stylesheets: ['./component-demo.css'] },
	render: ({ id, name, summary, children }) => (
		<article id={id} class="demo">
			<header class="demo__header">
				<h2 class="demo__name">
					<a href={`#${id}`} class="demo__anchor">
						{name}
					</a>
				</h2>
				<p class="demo__summary">{summary}</p>
			</header>
			<div class="demo__stage">{children}</div>
		</article>
	),
});
