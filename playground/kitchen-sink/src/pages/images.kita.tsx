import { eco } from '@ecopages/core';
import { EcoImage } from '@ecopages/image-processor/component/html';
import { kitaKamakuraPng } from 'ecopages:images';
import { BaseLayout } from '@/layouts/base-layout';

export default eco.page({
	dependencies: {
		components: [BaseLayout],
	},
	layout: BaseLayout,
	metadata: () => ({
		title: 'Image Processor Lab',
		description: 'Responsive image variants, layout modes, and view transitions in the kitchen sink.',
	}),
	render: () => (
		<div class="space-y-8">
			<section class="card space-y-4">
				<p class="text-xs font-semibold uppercase tracking-[0.28em] text-sky-600">Image processor</p>
				<h1 class="font-display text-4xl font-semibold tracking-tight">
					One local asset, multiple delivery modes.
				</h1>
				<p class="max-w-3xl text-base leading-8 text-muted">
					This route exercises the image processor inside the kitchen sink with static variants, constrained
					sizing, full-width layouts, and styling overrides against the local{' '}
					<span class="font-mono">kita-kamakura.png</span> source file.
				</p>
			</section>

			<section class="grid gap-6 lg:grid-cols-3">
				<div class="card space-y-3">
					<p class="text-xs uppercase tracking-[0.24em] text-muted">Static variant sm</p>
					<EcoImage {...kitaKamakuraPng} alt="Kita Kamakura small variant" staticVariant="sm" />
				</div>
				<div class="card space-y-3">
					<p class="text-xs uppercase tracking-[0.24em] text-muted">Static variant md</p>
					<EcoImage {...kitaKamakuraPng} alt="Kita Kamakura medium variant" staticVariant="md" />
				</div>
				<div class="card space-y-3">
					<p class="text-xs uppercase tracking-[0.24em] text-muted">Static variant lg</p>
					<EcoImage {...kitaKamakuraPng} alt="Kita Kamakura large variant" staticVariant="lg" />
				</div>
			</section>

			<section class="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
				<div class="card space-y-3">
					<p class="text-xs uppercase tracking-[0.24em] text-muted">Constrained layout</p>
					<EcoImage
						{...kitaKamakuraPng}
						alt="Kita Kamakura constrained"
						layout="constrained"
						width={420}
						class="rounded-md"
					/>
				</div>
				<div class="card space-y-3">
					<p class="text-xs uppercase tracking-[0.24em] text-muted">Full-width layout</p>
					<EcoImage
						{...kitaKamakuraPng}
						alt="Kita Kamakura full width"
						layout="full-width"
						height={420}
						data-view-transition="kitchen-sink-kamakura"
					/>
					<p class="text-sm leading-7 text-muted">
						This image carries a stable <span class="font-mono">data-view-transition</span> key so the
						browser router can animate it between routes when another page reuses the same asset.
					</p>
				</div>
			</section>

			<section class="card card--accent space-y-4">
				<p class="text-xs uppercase tracking-[0.24em] text-muted">Render notes</p>
				<ul class="space-y-3 text-sm leading-7 text-on-background-accent">
					<li>
						Imports from <span class="font-mono">ecopages:images</span> are auto-detected and bundled.
					</li>
					<li>
						The same source asset can be rendered in Kita pages and React routes through the matching
						EcoImage component.
					</li>
					<li>
						Open the{' '}
						<a class="underline underline-offset-2 text-sky-600" href="/transitions">
							transition lab
						</a>{' '}
						to see this image animate between a compact card and a wide hero layout.
					</li>
					<li>
						Open{' '}
						<a class="underline underline-offset-2 text-sky-600" href="/integration-matrix/react-entry">
							the React entry
						</a>{' '}
						to see the same asset handled through the React integration.
					</li>
				</ul>
			</section>
		</div>
	),
});
