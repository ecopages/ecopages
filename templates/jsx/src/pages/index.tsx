import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { EcoImage } from '@ecopages/image-processor/component/jsx';
import { logoOnGhDarkPng } from 'ecopages:images';
import { BaseLayout } from '@/layouts/base-layout';
import { Counter } from '@/components/counter';
import ShowcaseMdx from '@/components/showcase.mdx';
import './index.css';

const CARDS = [
	{
		title: 'Interactive on demand',
		description: 'Hover or focus the counter to load its script. Islands hydrate only when needed.',
		cta: { href: 'https://ecopages.app/docs/reference/eco-namespace', label: 'Read about islands' },
		demo: 'counter',
	},
	{
		title: 'MDX as components',
		description: 'Import Markdown content directly into a page and compose it alongside other components.',
		cta: { href: '/docs', label: 'Open the MDX page' },
		demo: 'mdx',
	},
	{
		title: 'Optimized images',
		description: 'Images are processed at build time into responsive variants and modern formats.',
		cta: { href: '/image', label: 'See image optimization' },
		demo: 'image',
	},
	{
		title: 'Enhanced navigation',
		description: 'Page loads become smooth SPA navigations with shared-element view transitions.',
		cta: { href: '/image-detail', label: 'Try the image transition' },
		demo: null,
	},
] as const;

export default eco.page<{}, JsxRenderable>({
	layout: { component: BaseLayout, props: () => ({ prose: false }) },
	metadata: () => ({ title: 'Ecopages JSX', description: 'Build an HTML-first application with Ecopages JSX.' }),
	render: () => (
		<div class="showcase">
			<div class="welcome-alert" role="alert">
				<p class="welcome-alert__title">Welcome to Ecopages</p>
				<p class="welcome-alert__desc">
					A static-first foundation for expressive pages and islands of interactivity.
				</p>
			</div>

			<div class="showcase-grid" role="feed" aria-label="Ecopages features">
				{CARDS.map((card, index) => (
					<article
						class="showcase-card"
						role="article"
						aria-posinset={index + 1}
						aria-setsize={CARDS.length}
						tabindex={0}
					>
						<div class="card-body">
							<h2 class="section-title">{card.title}</h2>
							<p class="section-desc">{card.description}</p>
							{card.demo === 'counter' ? (
								<div class="card-demo">
									<Counter count={0} />
								</div>
							) : card.demo === 'mdx' ? (
								<div class="card-demo mdx-preview prose">
									<ShowcaseMdx />
								</div>
							) : card.demo === 'image' ? (
								<div class="image-demo">
									<EcoImage
										{...logoOnGhDarkPng}
										alt="Logo on GitHub dark"
										width={120}
										class="rounded"
									/>
								</div>
							) : null}
						</div>
						<div class="card-actions">
							<a href={card.cta.href} class="card-link">
								{card.cta.label}
							</a>
						</div>
					</article>
				))}
			</div>
		</div>
	),
});
