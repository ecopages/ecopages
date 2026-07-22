import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { createMarkupNodeLike } from '@ecopages/jsx';
import { EcoImage as renderEcoImage } from '@ecopages/image-processor/component/html';
import { BaseLayout } from '@/layouts/base-layout';
import { RadiantCounter } from '@/components/radiant-counter';
import { kitaKamakuraPng } from 'ecopages:images';
import ShowcaseMdx from '@/components/showcase.mdx';

export default eco.page<{}, JsxRenderable>({
	dependencies: {
		stylesheets: ['./index.css'],
		components: [RadiantCounter],
	},
	layout: BaseLayout,
	render: () => {
		return (
			<div class="showcase prose">
				<section class="showcase-section">
					<h2 class="section-title">Reactivity</h2>
					<p>Islands of interactivity. Control how and when to load your JS.</p>
					<RadiantCounter count={0} />
					<a href="https://ecopages.app/docs/reference/eco-namespace" class="section-link mt-4">
						Ecopages Docs →
					</a>
				</section>

				<section class="showcase-section">
					<h2 class="section-title">MDX</h2>
					<ShowcaseMdx />
					<a href="/docs" class="section-link">
						MDX as page →
					</a>
				</section>

				<section class="showcase-section">
					<div class="grid md:grid-cols-3 gap-8">
						<div class="col-span-2">
							<h2 class="section-title">Optimization</h2>
							<p>Plug and play image processing and optimization.</p>
							<a href="/image" class="section-link">
								Image Docs →
							</a>
						</div>
						{createMarkupNodeLike(
							renderEcoImage({
								...kitaKamakuraPng,
								alt: 'Kita-kamakura',
								class: 'rounded object-cover',
								'data-view-transition': 'kita-image',
							}),
						)}
					</div>
				</section>
			</div>
		);
	},
});
