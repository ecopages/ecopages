import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { RuiButton } from '@ecopages/radiant-ui/button';
import { RuiChip } from '@ecopages/radiant-ui/chip';
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
	label,
	title,
	description,
	position,
}: {
	href: string;
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
				Explore {label}
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

export default eco.page<{}, JsxRenderable>({
	layout: BaseLayout,
	dependencies: {
		components: [CodeTabs],
		stylesheets: ['./index.css'],
	},
	metadata: () => ({
		title: 'Ecopages',
		description:
			'A file-based web framework for HTML-first multi-page applications with optional interactive islands.',
	}),
	render: () => (
		<div class="home-layout not-prose">
			<header class="home-header">
				<div class="home-hero">
					<div class="home-hero__text">
						<RuiHeading size="xl" class="home-header__heading">
							<RuiHeadingEyebrow>Ecopages</RuiHeadingEyebrow>
							<RuiHeadingTitle as="h1">
								A file-based web framework for HTML-first multi-page applications.
							</RuiHeadingTitle>
							<RuiHeadingDescription>
								Optional interactive islands, revalidating cache, and first-party libraries including
								Ecopages JSX, Radiant, Browser Router, React Router, and PostCSS Processor.
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
								See installation
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
									id: 'eco-component',
									label: 'eco.component.tsx',
									html: `<figure data-rehype-pretty-code-figure class="home-code-block">${componentExample}</figure>`,
									content: componentExampleCode,
								},
								{
									id: 'home-page',
									label: 'src/pages/index.tsx',
									html: `<figure data-rehype-pretty-code-figure class="home-code-block">${pageExample}</figure>`,
									content: pageExampleCode,
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
							href="/docs/getting-started/introduction"
							label="Get Started"
							title="Start with Ecopages JSX"
							description="Use the first-party Integration for internal-first DX, then expand only when your Page needs it."
							position={1}
						/>
						<HomeFeedArticle
							href="/docs/core/components"
							label="Core"
							title="Build with core primitives"
							description="Use eco.page and eco.component to define Pages and Components with explicit Dependencies."
							position={2}
						/>
						<HomeFeedArticle
							href="/docs/ecosystem/radiant"
							label="Ecosystem"
							title="Add Radiant when needed"
							description="Layer in first-party reactive Components with Radiant without leaving the Ecopages model."
							position={3}
						/>
						<HomeFeedArticle
							href="/docs/ecosystem/packages"
							label="Libraries"
							title="Use more first-party packages"
							description="Discover core libraries built to work together: Ecopages JSX, Radiant, routers, and processors."
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
						<li>Start with introduction and installation to scaffold your first project.</li>
						<li>Start with Ecopages JSX for the default first-party authoring experience.</li>
						<li>Learn eco.page, Layouts, and Html includes to understand Page composition.</li>
						<li>Add Radiant and routing libraries when your Components need richer interactivity.</li>
						<li>Add typed handlers and Explicit Routes for Dynamic Pages.</li>
					</ol>

					<div class="mt-8 grid gap-3">
						<HomePathCard
							href="/docs/getting-started/installation"
							title="Install and initialize"
							description="Use the Ecopages CLI, start with Ecopages JSX, and run your first local development server."
						/>
						<HomePathCard
							href="/docs/ecosystem/radiant"
							title="Add Radiant components"
							description="Adopt first-party reactive Components when your UI needs client behavior."
						/>
						<HomePathCard
							href="/docs/ecosystem/packages"
							title="Explore first-party libraries"
							description="Find Ecopages packages that share one model across rendering, routing, and styling."
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

				<div class="home-sidebar__section">
					<p class="home-sidebar__label">Ecosystem</p>
					<div class="home-sidebar__tags">
						<RuiChip class="font-mono">@ecopages/core</RuiChip>
						<RuiChip class="font-mono">@ecopages/ecopages-jsx</RuiChip>
						<RuiChip class="font-mono">@ecopages/radiant</RuiChip>
						<RuiChip class="font-mono">@ecopages/browser-router</RuiChip>
						<RuiChip class="font-mono">@ecopages/postcss-processor</RuiChip>
					</div>
				</div>
			</aside>

			<footer class="home-footer">
				<p>
					Made with{' '}
					<a href="https://github.com/ecopages/ecopages" target="_blank" rel="noopener noreferrer">
						Ecopages
					</a>
					© {new Date().getFullYear()}
				</p>
			</footer>
		</div>
	),
});
