import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { EcoImage } from '@ecopages/image-processor/component/jsx';
import { logoOnGhDarkPng } from 'ecopages:images';
import { RuiAlert, RuiAlertDescription, RuiAlertTitle } from '@ecopages/radiant-ui/alert';
import { RuiButton } from '@ecopages/radiant-ui/button';
import { BaseLayout } from '@/layouts/base-layout';
import { RadiantCounter } from '@/components/radiant-counter';
import ShowcaseMdx from '@/components/showcase.mdx';

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
		cta: { href: '/about', label: 'Open the MDX page' },
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
	dependencies: { stylesheets: ['./index.css'] },
	layout: { component: BaseLayout, props: () => ({ prose: false }) },
	metadata: () => ({ title: 'Radiant UI', description: 'Build an Ecopages application with Radiant UI.' }),
	render: () => (
		<div class="showcase">
			<RuiAlert variant="info" layout="banner" class="welcome-alert">
				<RuiAlertTitle>Welcome to Ecopages</RuiAlertTitle>
				<RuiAlertDescription>
					A static-first foundation for expressive pages and islands of interactivity.
				</RuiAlertDescription>
			</RuiAlert>
			<div class="showcase-grid" role="feed" aria-label="Ecopages features">
				{CARDS.map((card, index) => (
					<article
						class="showcase-card"
						role="article"
						aria-posinset={index + 1}
						aria-setsize={CARDS.length}
						tabindex="0"
					>
						<div class="card-body">
							<h2 class="section-title">{card.title}</h2>
							<p class="section-desc">{card.description}</p>
							{card.demo === 'counter' ? (
								<div class="card-demo">
									<RadiantCounter count={0} />
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
							<RuiButton href={card.cta.href} variant="link" size="none" class="card-link">
								{card.cta.label}
							</RuiButton>
						</div>
					</article>
				))}
			</div>
		</div>
	),
});
