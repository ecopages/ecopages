import { eco } from 'ecopages/core';
import { BaseLayout } from '@/layouts/base-layout/base-layout.kita';
import { RadiantCounter } from '@/components/radiant-counter.kita';
import { EcoImage } from 'ecopages/image-processor/component/html';
import { kitaKamakuraPng } from 'ecopages:images';
import ShowcaseMdx from '@/components/showcase.mdx';

export default eco.page({
	dependencies: {
		stylesheets: ['./index.css'],
		components: [BaseLayout, RadiantCounter],
	},
	layout: BaseLayout,
	render: () => {
		return (
			<div class="showcase prose">
				<section class="showcase-section">
					<div>
						<h2 class="section-title">Reactivity</h2>
						<p>Islands of interactivity. Control how and when to load your JS.</p>
						<a href="https://ecopages.app/docs/reference/eco-namespace" class="section-link">
							Ecopages Docs →
						</a>
					</div>
					<RadiantCounter count={0} />
				</section>

				<section class="showcase-section">
					<div>
						<h2 class="section-title">MDX</h2>
						<ShowcaseMdx />
					</div>
					<a href="/docs" class="section-link">
						MDX as page →
					</a>
				</section>

				<section class="showcase-section">
					<div class="grid md:grid-cols-2 gap-8">
						<div>
							<h2 class="section-title">Optimization</h2>
							<p>Plug and play image processing and optimization.</p>{' '}
							<a href="/image" class="section-link">
								Image Docs →
							</a>
						</div>
						<EcoImage
							{...kitaKamakuraPng}
							alt="Kita-kamakura"
							class="rounded"
							data-view-transition="kita-image"
						/>
					</div>
				</section>
			</div>
		);
	},
});
