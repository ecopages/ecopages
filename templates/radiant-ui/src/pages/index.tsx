import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { EcoImage } from '@ecopages/image-processor/component/jsx';
import { logoOnGhDarkPng } from 'ecopages:images';
import { Hero } from '@/components/blocks/hero';
import { LogoCloud } from '@/components/blocks/logo-cloud';
import { FeatureGrid } from '@/components/blocks/feature-grid';
import { TextMedia } from '@/components/blocks/text-media';
import { CardCarousel } from '@/components/blocks/card-carousel';
import { Stats } from '@/components/blocks/stats';
import { Testimonials } from '@/components/blocks/testimonials';
import { Faq } from '@/components/blocks/faq';
import { CallToAction } from '@/components/blocks/call-to-action';
import { Newsletter } from '@/components/blocks/newsletter';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BaseLayout } from '@/layouts/base-layout';
import { RadiantCounter } from '@/components/radiant-counter';
import { site } from '@/site.config';

const FEATURES = [
	{
		title: 'Ship HTML first',
		description:
			'Pages render at build time. JavaScript is opt-in, per component, and never blocks the first paint.',
		href: '/components',
		linkLabel: 'Browse the components',
	},
	{
		title: 'Islands on demand',
		description:
			'Each component declares its own script and when to load it — on idle, on visible, or on first interaction.',
		href: '/about',
		linkLabel: 'How islands work',
	},
	{
		title: 'Accessible by default',
		description:
			'Every widget follows an APG pattern: real roles, real keyboard models, light DOM you can style and inspect.',
		href: '/components',
		linkLabel: 'See the catalog',
	},
	{
		title: 'Typed end to end',
		description:
			'Components carry their props from the package through to your pages, so a wrong prop is a build error.',
		href: '/forms',
		linkLabel: 'Try the forms',
	},
	{
		title: 'Images, handled',
		description: 'The build emits responsive variants and modern formats, and the markup to serve the right one.',
		href: '/image',
		linkLabel: 'See the pipeline',
	},
	{
		title: 'Themes as tokens',
		description:
			'Colour, spacing, radius and motion are CSS custom properties. Swap a token pack, restyle everything.',
		href: '/components',
		linkLabel: 'Change the theme',
	},
];

const CARDS = [
	{
		id: 'marketing',
		title: 'Marketing site',
		description: 'Hero, features, testimonials and a signup band — every block on this page, rearranged.',
		footer: <Badge variant="outline">Blocks</Badge>,
	},
	{
		id: 'docs',
		title: 'Documentation',
		description: 'Sidebar navigation, a table of contents that tracks scroll, and MDX content pages.',
		footer: <Badge variant="muted">MDX</Badge>,
	},
	{
		id: 'app',
		title: 'Application shell',
		description: 'Tables, dialogs, menus and forms with validation, all rendered on the server first.',
		footer: <Badge variant="ghost">Dashboard</Badge>,
	},
	{
		id: 'catalog',
		title: 'Product catalog',
		description: 'Filterable listings built on combobox, tag group and pagination.',
		footer: <Badge>Commerce</Badge>,
	},
];

const FAQ = [
	{
		question: 'Do I have to use every component?',
		answer: 'No. Each one lives in its own module under src/components/ui and carries its own stylesheet, so a page ships only what it renders. Delete the ones you will never use.',
	},
	{
		question: 'Can I change how a component is composed?',
		answer: 'That is the point. Every module is an ordinary project file — open src/components/ui/alert/alert.tsx and rewrite the render. Nothing regenerates it.',
	},
	{
		question: 'Where does the styling come from?',
		answer: 'Radiant UI ships compiled CSS driven by custom properties. src/styles/tailwind.css imports one theme; swap it for glacier, aurora or a token pack of your own.',
	},
	{
		question: 'How do I make this my site?',
		answer: 'Start with src/site.config.ts for the name and navigation, then rewrite this page from the blocks in src/components/blocks. The layout, header and footer follow the config.',
	},
];

export default eco.page<{}, JsxRenderable>({
	dependencies: {
		components: [
			Hero,
			LogoCloud,
			FeatureGrid,
			TextMedia,
			CardCarousel,
			Stats,
			Testimonials,
			Faq,
			CallToAction,
			Newsletter,
			Button,
			Badge,
			RadiantCounter,
		],
	},
	layout: { component: BaseLayout, props: () => ({ currentPath: '/' }) },
	metadata: () => ({ title: site.name, description: site.description }),
	render: () => (
		<>
			<Hero
				eyebrow="Ecopages + Radiant UI"
				title="Every component you need, already wired up"
				description={site.description}
				actions={
					<>
						<Button href="/components">Browse components</Button>
						<Button href="/about" variant="outline">
							Read the docs
						</Button>
					</>
				}
				media={<EcoImage {...logoOnGhDarkPng} alt="" width={520} />}
			/>

			<LogoCloud
				title="Built on"
				logos={[
					{ name: 'Ecopages', logo: <span class="text-lg font-semibold">Ecopages</span> },
					{ name: 'Radiant', logo: <span class="text-lg font-semibold">Radiant</span> },
					{ name: 'Radiant UI', logo: <span class="text-lg font-semibold">Radiant UI</span> },
					{ name: 'Tailwind CSS', logo: <span class="text-lg font-semibold">Tailwind</span> },
				]}
			/>

			<FeatureGrid
				tinted
				eyebrow="Why this template"
				title="A starter that is actually started"
				description="Fifty-six components and a dozen page blocks, composed and ready to render."
				features={FEATURES}
			/>

			<TextMedia
				eyebrow="Islands"
				title="Interactivity where you ask for it"
				description="This counter's script loads the moment you hover or focus it — never before. Every other component on the page is plain HTML until something needs otherwise."
				actions={
					<Button href="/about" variant="outline">
						How it works
					</Button>
				}
				media={
					<div class="flex items-center justify-center rounded-lg border border-border bg-background-accent p-10">
						<RadiantCounter count={0} />
					</div>
				}
			/>

			<Stats
				tinted
				title="What ships"
				stats={[
					{ value: '56', label: 'Components', description: 'Each with its own stylesheet' },
					{ value: '13', label: 'Page blocks', description: 'Composed from the components' },
					{ value: '0', label: 'Blocking scripts', description: 'Everything loads on a trigger' },
					{ value: 'APG', label: 'Patterns followed', description: 'Roles and keyboard models' },
				]}
			/>

			<CardCarousel
				eyebrow="Starting points"
				title="Four ways to use this"
				description="The same components and blocks, pointed at different problems."
				label="Starting points"
				cards={CARDS}
				perView={3}
			/>

			<Testimonials
				tinted
				title="What the shape buys you"
				testimonials={[
					{
						quote: 'Each component owns its stylesheet, so a landing page ships four kilobytes of CSS instead of the whole design system.',
						author: 'Per-page CSS',
						role: 'dependencies.stylesheets',
					},
					{
						quote: 'Scripts declare their own trigger. A dialog on idle, a carousel when it scrolls into view, a counter on first hover.',
						author: 'Lazy by declaration',
						role: 'dependencies.scripts',
					},
					{
						quote: 'The composed components are ordinary files in your repo. Rewrite the render and the sync script will not touch it.',
						author: 'Yours to edit',
						role: 'src/components/ui',
					},
				]}
			/>

			<Faq title="Questions" entries={FAQ} />

			<CallToAction
				variant="band"
				eyebrow="Get started"
				title="Make it yours"
				description="Edit src/site.config.ts, rebuild this page from the blocks, and delete what you do not need."
				actions={
					<>
						<Button href="/components">See every component</Button>
						<Button href="https://ecopages.app" variant="outline">
							Ecopages docs
						</Button>
					</>
				}
			/>

			<Newsletter
				title="Release notes"
				description="Occasional mail when Ecopages or Radiant UI ships something worth knowing about."
				note="This form is a demo — point its action at your own endpoint."
			/>
		</>
	),
});
