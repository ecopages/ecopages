import { eco } from '@ecopages/core';
import * as images from 'ecopages:images';
import { LitCounter } from '@/components/lit-counter';
import { BaseLayout } from '@/layouts/base-layout';
import ShowcaseMdx from '@/components/showcase.mdx';
import './index.css';

const CARDS = [
	[
		'Interactive on demand',
		'Hover or focus the counter to load its script. Islands hydrate only when needed.',
		'https://ecopages.app/docs/reference/eco-namespace',
		'Read about islands',
		'counter',
	],
	[
		'MDX as components',
		'Import Markdown content directly into a page and compose it alongside other components.',
		'/about',
		'Open the content page',
		'mdx',
	],
	[
		'Optimized images',
		'Images are processed at build time into responsive variants and modern formats.',
		'/image',
		'See image optimization',
		'image',
	],
	[
		'Enhanced navigation',
		'Page loads become smooth SPA navigations with shared-element view transitions.',
		'/image-detail',
		'Try the image transition',
		null,
	],
] as const;

export default eco.page({
	layout: { component: BaseLayout, props: () => ({ prose: false }) },
	metadata: () => ({
		title: 'Ecopages Lit JSX',
		description: 'Build an HTML-first application with Ecopages Lit JSX.',
	}),
	render: () => (
		<div class="showcase">
			<div class="welcome-alert" role="alert">
				<p class="welcome-alert__title">Welcome to Ecopages</p>
				<p class="welcome-alert__desc">
					A static-first foundation for expressive pages and islands of interactivity.
				</p>
			</div>
			<div class="showcase-grid" role="feed" aria-label="Ecopages features">
				{CARDS.map(([title, description, href, label, demo], index) => (
					<article
						class="showcase-card"
						role="article"
						aria-posinset={index + 1}
						aria-setsize={CARDS.length}
						tabindex="0"
					>
						<div class="card-body">
							<h2 class="section-title">{title}</h2>
							<p class="section-desc">{description}</p>
							{demo === 'counter' ? (
								<div class="card-demo">
									<LitCounter count={0} />
								</div>
							) : demo === 'mdx' ? (
								<div class="card-demo mdx-preview prose">
									<ShowcaseMdx />
								</div>
							) : demo === 'image' ? (
								<div class="image-demo">
									<img
										{...images.kitaKamakuraPng.attributes}
										alt="Kita-kamakura"
										width={120}
										class="rounded"
									/>
								</div>
							) : null}
						</div>
						<div class="card-actions">
							<a href={href} class="card-link">
								{label}
							</a>
						</div>
					</article>
				))}
			</div>
		</div>
	),
});
