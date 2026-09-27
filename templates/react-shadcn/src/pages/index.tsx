import { eco } from '@ecopages/core';
import type { ReactNode } from 'react';
import { EcoImage } from '@ecopages/image-processor/component/react';
import { logoOnGhDarkPng } from 'ecopages:images';
import { Counter } from '@/components/counter';
import { Button, LinkButton } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { BaseLayout } from '@/layouts/base-layout';
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
		cta: { href: '/about', label: 'Open the content page' },
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

export default eco.page<{}, ReactNode>({
	layout: { component: BaseLayout, props: () => ({ prose: false }) },
	metadata: () => ({
		title: 'Ecopages React + shadcn',
		description: 'Build an HTML-first application with Ecopages React and shadcn/ui on React Aria.',
	}),
	render: () => (
		<div className="showcase">
			<Card>
				<CardHeader>
					<CardTitle>shadcn/ui on React Aria</CardTitle>
					<CardDescription>
						components.json uses the aria-vega style. Button, Card, and Input show the installed React Aria
						components.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form
						className="flex flex-col gap-3 sm:flex-row"
						onSubmit={(event) => {
							event.preventDefault();
						}}
					>
						<Input type="email" name="email" placeholder="name@example.com" aria-label="Email" />
						<Button type="submit">Continue</Button>
					</form>
					<div className="flex flex-wrap items-center gap-2">
						<Button variant="secondary">Secondary</Button>
						<Button variant="outline">Outline</Button>
						<Button variant="ghost">Ghost</Button>
					</div>
				</CardContent>
				<CardFooter>
					<LinkButton href="https://ui.shadcn.com/docs/components/aria/button" variant="link">
						Component docs
					</LinkButton>
				</CardFooter>
			</Card>
			<div className="welcome-alert" role="alert">
				<p className="welcome-alert__title">Welcome to Ecopages</p>
				<p className="welcome-alert__desc">
					A static-first foundation for expressive pages and islands of interactivity.
				</p>
			</div>
			<div className="showcase-grid" role="feed" aria-label="Ecopages features">
				{CARDS.map((card, index) => (
					<article
						key={card.title}
						className="showcase-card"
						role="article"
						aria-posinset={index + 1}
						aria-setsize={CARDS.length}
						tabIndex={0}
					>
						<div className="card-body">
							<h2 className="section-title">{card.title}</h2>
							<p className="section-desc">{card.description}</p>
							{card.demo === 'counter' ? (
								<div className="card-demo">
									<Counter defaultValue={0} />
								</div>
							) : card.demo === 'mdx' ? (
								<div className="card-demo mdx-preview prose">
									<ShowcaseMdx />
								</div>
							) : card.demo === 'image' ? (
								<div className="image-demo">
									<EcoImage
										{...logoOnGhDarkPng}
										alt="Logo on GitHub dark"
										width={120}
										className="rounded"
									/>
								</div>
							) : null}
						</div>
						<div className="card-actions">
							<a href={card.cta.href} className="card-link">
								{card.cta.label}
							</a>
						</div>
					</article>
				))}
			</div>
		</div>
	),
});
