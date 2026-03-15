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
		title: 'Transition Lab',
		description: 'Test browser-router image transitions between two shell routes.',
	}),
	render: () => (
		<div class="space-y-8">
			<section class="card space-y-4">
				<p class="text-xs font-semibold uppercase tracking-[0.28em] text-sky-600">Transition lab</p>
				<h1 class="font-display text-4xl font-semibold tracking-tight">
					Image handoff across browser-router routes
				</h1>
				<p class="max-w-3xl text-base leading-8 text-muted">
					This route uses the same source asset and <span class="font-mono">data-view-transition</span> key as
					the image processor page. Move between the two routes to confirm the browser router carries the
					image through a shared-element transition.
				</p>
			</section>

			<section class="grid gap-6 lg:grid-cols-[0.75fr_1.25fr] lg:items-center">
				<div class="card space-y-4">
					<p class="text-xs uppercase tracking-[0.24em] text-muted">Compact preview</p>
					<EcoImage
						{...kitaKamakuraPng}
						alt="Kita Kamakura compact preview"
						layout="constrained"
						width={320}
						class="rounded-xl"
						data-view-transition="kitchen-sink-kamakura"
						data-view-transition-duration="550ms"
					/>
				</div>

				<div class="card card--accent space-y-4">
					<p class="text-xs uppercase tracking-[0.24em] text-on-background-accent/70">Try this flow</p>
					<ol class="space-y-3 text-sm leading-7 text-on-background-accent">
						<li>Open the Images page from the link below.</li>
						<li>Navigate back here using the browser router nav.</li>
						<li>Watch the shared image resize and move instead of cross-fading independently.</li>
					</ol>
					<div class="flex flex-wrap gap-3 pt-2">
						<a href="/images" class="button bg-white/90 text-slate-900 hover:bg-white">
							Open the image processor page
						</a>
						<a href="/integration-matrix/react-entry" class="button text-on-background-accent">
							Compare with the React entry
						</a>
					</div>
				</div>
			</section>
		</div>
	),
});
