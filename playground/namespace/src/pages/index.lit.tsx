/**
 * Home page using eco.page() demonstrating all three counter types
 */
import { eco } from '@ecopages/core';
import type { GetMetadata } from '@ecopages/core';
import { BaseLayout } from '../layouts/base-layout.kita';
import { RadiantCounter } from '../components/radiant-counter/radiant-counter.kita';
import { AlpineCounter } from '../components/alpine-counter/alpine-counter.kita';
import { LitCounter } from '../components/lit-counter/lit-counter.kita';

export const getMetadata: GetMetadata = () => ({
	title: 'Eco Namespace Playground',
	description: 'Demonstrating the eco namespace API with lazy loading',
});

export default eco.page({
	layout: BaseLayout,
	dependencies: {
		components: [RadiantCounter, AlpineCounter, LitCounter],
	},
	render: () => (
		<div class="max-w-5xl mx-auto space-y-12">
			<section class="text-center space-y-6 pt-12 pb-8">
				<h2 class="text-5xl md:text-7xl font-bold tracking-tight bg-clip-text text-transparent bg-linear-to-br from-white via-gray-200 to-gray-500">
					Eco Namespace
				</h2>
				<p class="text-lg text-gray-400 max-w-2xl mx-auto leading-relaxed">
					A demonstration of high-performance component hydration and lazy loading using the{' '}
					<code class="px-1.5 py-0.5 rounded bg-white/10 text-white font-mono text-sm">eco</code> namespace
					API.
				</p>
			</section>

			<div class="grid grid-cols-1 md:grid-cols-3 gap-6">
				<div class="p-6 rounded-2xl border border-white/10 bg-zinc-900/30 backdrop-blur-sm hover:border-white/20 transition-colors">
					<div class="h-10 w-10 rounded-lg bg-indigo-500/20 flex items-center justify-center mb-4 text-indigo-400 border border-indigo-500/30">
						<svg
							width="20"
							height="20"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
						>
							<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
						</svg>
					</div>
					<h3 class="text-xl font-bold text-white mb-2">Radiant Counter</h3>
					<p class="text-sm text-gray-500 mb-6">Hydrates on interaction events like hover or click.</p>
					<div class="pt-4 border-t border-white/5">
						<RadiantCounter count={5} />
					</div>
				</div>

				<div class="p-6 rounded-2xl border border-white/10 bg-zinc-900/30 backdrop-blur-sm hover:border-white/20 transition-colors">
					<div class="h-10 w-10 rounded-lg bg-yellow-500/20 flex items-center justify-center mb-4 text-yellow-400 border border-yellow-500/30">
						<svg
							width="20"
							height="20"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
						>
							<path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
							<path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
						</svg>
					</div>
					<h3 class="text-xl font-bold text-white mb-2">Alpine Counter</h3>
					<p class="text-sm text-gray-500 mb-6">Loads scripts only when the component enters the viewport.</p>
					<div class="pt-4 border-t border-white/5">
						<AlpineCounter count={10} />
					</div>
				</div>

				<div class="p-6 rounded-2xl border border-white/10 bg-zinc-900/30 backdrop-blur-sm hover:border-white/20 transition-colors">
					<div class="h-10 w-10 rounded-lg bg-pink-500/20 flex items-center justify-center mb-4 text-pink-400 border border-pink-500/30">
						<svg
							width="20"
							height="20"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
						>
							<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
						</svg>
					</div>
					<h3 class="text-xl font-bold text-white mb-2">Lit Counter</h3>
					<p class="text-sm text-gray-500 mb-6">Standard web components with interaction hydration.</p>
					<div class="pt-4 border-t border-white/5">
						<LitCounter count={15} />
					</div>
				</div>
			</div>
		</div>
	),
});
