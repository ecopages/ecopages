import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { RuiButton } from '@ecopages/radiant-ui/button';
import {
	RuiFeed,
	RuiFeedArticle,
	RuiFeedArticleActions,
	RuiFeedArticleContent,
	RuiFeedArticleHeader,
} from '@ecopages/radiant-ui/feed';
import { RuiHeading, RuiHeadingDescription, RuiHeadingEyebrow, RuiHeadingTitle } from '@ecopages/radiant-ui/heading';
import { BaseLayout } from '@/layouts/base-layout';
import { CodeTabs } from '@/components/code-tabs';
import {
	componentExample,
	componentExampleCode,
	configExample,
	configExampleCode,
	pageExample,
	pageExampleCode,
} from '@/homepage/examples.server';

const HomeFeedArticle = ({
	href,
	cta,
	label,
	title,
	description,
	position,
}: {
	href: string;
	cta: string;
	label: string;
	title: string;
	description: string;
	position: number;
}) => (
	<RuiFeedArticle posinset={position} setsize={4} tabindex={-1}>
		<RuiFeedArticleHeader>
			<RuiHeading size="sm">
				<RuiHeadingEyebrow>{label}</RuiHeadingEyebrow>
				<RuiHeadingTitle as="h2">{title}</RuiHeadingTitle>
			</RuiHeading>
		</RuiFeedArticleHeader>
		<RuiFeedArticleContent>
			<p>{description}</p>
		</RuiFeedArticleContent>
		<RuiFeedArticleActions class="mt-auto">
			<RuiButton href={href} variant="link" size="none">
				{cta}
			</RuiButton>
		</RuiFeedArticleActions>
	</RuiFeedArticle>
);

const HomePathCard = ({ href, title, description }: { href: string; title: string; description: string }) => (
	<a
		href={href}
		class="flex flex-col gap-1 rounded-sm border border-border bg-background p-4 text-on-background no-underline transition-colors hover:bg-secondary-container/30"
	>
		<p class="text-sm font-semibold">{title}</p>
		<p class="text-sm text-on-background/70">{description}</p>
	</a>
);

type HomeFooterLink = {
	label: string;
	href?: string;
	external?: boolean;
};

type HomeFooterColumnData = {
	title: string;
	links: HomeFooterLink[];
};

const HOME_FOOTER_COLUMNS: HomeFooterColumnData[] = [
	{
		title: 'Ecosystem',
		links: [
			{ label: 'Ecopages' },
			{ label: 'Radiant', href: 'https://radiant.ecopages.app', external: true },
			{ label: 'Radiant UI', href: 'https://radiant-ui.ecopages.app', external: true },
			{ label: 'Scripts Injector', href: 'https://scripts-injector.ecopages.app', external: true },
			{ label: 'Logger', href: 'https://github.com/ecopages/logger', external: true },
		],
	},
	{
		title: 'Integrations',
		links: [
			{ label: 'Ecopages JSX', href: '/docs/integrations/ecopages-jsx' },
			{ label: 'KitaJS', href: '/docs/integrations/kitajs' },
			{ label: 'React', href: '/docs/integrations/react' },
			{ label: 'Lit', href: '/docs/integrations/lit' },
			{ label: 'MDX', href: '/docs/integrations/mdx' },
		],
	},
	{
		title: 'Processors',
		links: [
			{ label: 'PostCSS', href: '/docs/ecosystem/postcss-processor' },
			{ label: 'Image', href: '/docs/ecosystem/image-processor' },
			{ label: 'Content', href: '/docs/ecosystem/content-processor' },
		],
	},
	{
		title: 'Libraries',
		links: [
			{ label: 'Browser Router', href: '/docs/ecosystem/browser-router' },
			{ label: 'React Router', href: '/docs/ecosystem/react-router' },
			{ label: 'Vite Plugin', href: '/docs/ecosystem/vite-plugin' },
			{ label: 'File System', href: '/docs/ecosystem/file-system' },
			{ label: 'CLI', href: '/docs/ecosystem/ecopages' },
		],
	},
];

const HomeFooterColumn = ({ title, links }: HomeFooterColumnData) => (
	<div class="home-footer__col">
		<p class="home-footer__label">{title}</p>
		<ul class="home-footer__list">
			{links.map((link) => (
				<li>
					{link.href ? (
						<a
							href={link.href}
							{...(link.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
						>
							{link.label}
						</a>
					) : (
						<span aria-current="page">{link.label}</span>
					)}
				</li>
			))}
		</ul>
	</div>
);

export default eco.page<{}, JsxRenderable>({
	layout: BaseLayout,
	dependencies: {
		components: [CodeTabs],
		stylesheets: ['./index.css'],
	},
	metadata: () => ({
		title: 'Ecopages',
		description:
			'Pick an Integration, author Pages that render HTML, and add a server only when a Page needs more than static HTML.',
	}),
	render: () => (
		<div class="home-layout not-prose">
			<header class="home-header">
				<div class="home-hero">
					<div class="home-hero__text">
						<RuiHeading size="xl" class="home-header__heading">
							<RuiHeadingEyebrow>A modern, basic web framework</RuiHeadingEyebrow>
							<RuiHeadingTitle as="h1">
								Pick an Integration. Create Pages. Add a server if you need it.
							</RuiHeadingTitle>
							<RuiHeadingDescription>
								Start with Ecopages JSX or another Integration. Author Pages that render HTML. Add a
								Cache Strategy, typed handlers, and Explicit Routes only when a Page needs more than
								static HTML.
							</RuiHeadingDescription>
						</RuiHeading>

						<CodeTabs
							name="home-package-managers"
							label="Package managers"
							tabs={[
								{
									id: 'npm',
									label: 'npm',
									code: 'npx ecopages init ecopages-app && cd ecopages-app && npm install && npm run dev',
								},
								{
									id: 'pnpm',
									label: 'pnpm',
									code: 'pnpm dlx ecopages init ecopages-app && cd ecopages-app && pnpm install && pnpm dev',
								},
								{
									id: 'bun',
									label: 'bun',
									code: 'bunx ecopages init ecopages-app && cd ecopages-app && bun install && bun dev',
								},
							]}
							copyLabel="Copy init command"
							defaultSelectedKey="npm"
						/>

						<div class="home-header__actions">
							<RuiButton href="/docs/getting-started/introduction">Read introduction</RuiButton>
							<RuiButton href="/docs/getting-started/installation" variant="outline">
								Install Ecopages
							</RuiButton>
						</div>
					</div>

					<div class="home-hero__code">
						<CodeTabs
							name="home-starter-files"
							label="Starter files"
							tabs={[
								{
									id: 'eco-config',
									label: 'eco.config.ts',
									html: `<figure data-rehype-pretty-code-figure class="home-code-block">${configExample}</figure>`,
									content: configExampleCode,
								},
								{
									id: 'home-page',
									label: 'src/pages/index.tsx',
									html: `<figure data-rehype-pretty-code-figure class="home-code-block">${pageExample}</figure>`,
									content: pageExampleCode,
								},
								{
									id: 'eco-component',
									label: 'eco.component.tsx',
									html: `<figure data-rehype-pretty-code-figure class="home-code-block">${componentExample}</figure>`,
									content: componentExampleCode,
								},
							]}
							copyLabel="Copy source"
							defaultSelectedKey="eco-config"
						/>
					</div>
				</div>
			</header>

			<main class="home-main">
				<section>
					<RuiFeed label="Explore Ecopages" class="home-cards">
						<HomeFeedArticle
							href="/docs/integrations/overview"
							cta="Choose an Integration"
							label="Get Started"
							title="Pick an Integration"
							description="Start with Ecopages JSX, or choose React, Lit, KitaJS, or MDX when a Page needs a different renderer."
							position={1}
						/>
						<HomeFeedArticle
							href="/docs/core/pages"
							cta="Create Pages"
							label="Core"
							title="Create Pages"
							description="Define Pages with eco.page, compose them with a Layout, and declare Dependencies explicitly."
							position={2}
						/>
						<HomeFeedArticle
							href="/docs/server/explicit-routing"
							cta="Add a server"
							label="Server"
							title="Add a server if you need it"
							description="Keep Pages static until you need typed handlers or Explicit Routes."
							position={3}
						/>
						<HomeFeedArticle
							href="/docs/ecosystem/packages"
							cta="Browse packages"
							label="Libraries"
							title="Add the rest on demand"
							description="Reach for Radiant, routers, and processors when a Page needs more than HTML."
							position={4}
						/>
					</RuiFeed>
				</section>

				<section class="home-path">
					<RuiHeading as="header" size="sm">
						<RuiHeadingEyebrow>Suggested path</RuiHeadingEyebrow>
						<RuiHeadingTitle as="h2">Build confidence step by step</RuiHeadingTitle>
					</RuiHeading>
					<ol class="home-path__list">
						<li>Pick an Integration. Ecopages JSX is the default.</li>
						<li>Create Pages that render HTML.</li>
						<li>Compose them with a Layout and Html.</li>
						<li>Add Radiant or another Integration only where the UI is interactive.</li>
						<li>Add a server with typed handlers and Explicit Routes if you need request-time work.</li>
					</ol>

					<div class="mt-8 grid gap-3">
						<HomePathCard
							href="/docs/integrations/overview"
							title="Pick an Integration"
							description="Start with Ecopages JSX, or swap in React, Lit, KitaJS, or MDX."
						/>
						<HomePathCard
							href="/docs/core/pages"
							title="Create Pages"
							description="Author Pages with eco.page and compose them with a Layout."
						/>
						<HomePathCard
							href="/docs/server/explicit-routing"
							title="Add a server if you need it"
							description="Register typed handlers and Explicit Routes when static HTML is not enough."
						/>
					</div>
				</section>
			</main>

			<aside class="home-sidebar">
				<div class="home-sidebar__section">
					<p class="home-sidebar__label">Repository</p>
					<a href="https://github.com/ecopages/ecopages" class="home-sidebar__value home-sidebar__link">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="16"
							height="16"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path>
						</svg>
						ecopages/ecopages
					</a>
				</div>

				<div class="home-sidebar__section">
					<p class="home-sidebar__label">License</p>
					<p class="home-sidebar__value">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="16"
							height="16"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
							<path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
						</svg>
						MIT
					</p>
				</div>

				<div class="home-sidebar__section">
					<p class="home-sidebar__label">For agents</p>
					<div class="home-sidebar__tags">
						<RuiButton href="/skill.txt" variant="outline" size="sm" class="font-mono">
							skill.txt
						</RuiButton>
						<RuiButton href="/skill/SKILL.md" variant="outline" size="sm" class="font-mono">
							SKILL.md
						</RuiButton>
						<RuiButton href="/llms.txt" variant="outline" size="sm" class="font-mono">
							llms.txt
						</RuiButton>
					</div>
				</div>
			</aside>

			<footer class="home-footer">
				<nav class="home-footer__nav" aria-label="Ecopages ecosystem">
					{HOME_FOOTER_COLUMNS.map((column) => (
						<HomeFooterColumn title={column.title} links={column.links} />
					))}
				</nav>
				<div class="home-footer__bar">
					<p>
						Created by{' '}
						<a href="https://github.com/andeeplus" target="_blank" rel="noopener noreferrer">
							andeeplus
						</a>
					</p>
					<p>
						Built with{' '}
						<a href="https://github.com/ecopages/ecopages" target="_blank" rel="noopener noreferrer">
							Ecopages
						</a>
						© {new Date().getFullYear()}
					</p>
				</div>
			</footer>
		</div>
	),
});
