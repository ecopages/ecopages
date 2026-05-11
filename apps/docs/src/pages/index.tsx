import type { EcoComponent } from '@ecopages/core';
import { BaseLayout } from '@/layouts/base-layout';
import { CodeTabs } from '@/components/code-tabs';
import { componentExample, componentExampleCode, configExample, configExampleCode, pageExample, pageExampleCode } from '@/data/homepage-examples';
import { unsafeHtml } from '@ecopages/jsx/jsx-runtime';

const HomeCard = ({
	href,
	label,
	title,
	description,
}: {
	href: string;
	label: string;
	title: string;
	description: string;
}) => (
	<a href={href} class="home-card group">
		<article>
			<p class="home-card__label">{label}</p>
			<h1 class="home-card__title">{title}</h1>
			<p class="home-card__text">{description}</p>
		</article>
	</a>
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

const HomePage: EcoComponent = () => {
	return (
		<div class="home-layout not-prose">
			<header class="home-header">
				<div class="home-hero">
					<div class="home-hero__text">
						<p class="home-header__subtitle">Ecopages</p>
						<h1 class="home-header__title">
							A file-based web framework for HTML-first multi-page applications.
						</h1>
						<p class="home-header__description">
							Optional interactive islands, revalidating cache, and first-party libraries including
							Ecopages JSX, Radiant, Browser Router, React Router, and PostCSS Processor.
						</p>

						<CodeTabs
							label="Package managers"
							tabs={[
								{
									id: 'bun',
									label: 'bun',
									code: 'bunx ecopages init ecopages-app && cd ecopages-app && bun install && bun dev',
								},
								{
									id: 'pnpm',
									label: 'pnpm',
									code: 'pnpm dlx ecopages init ecopages-app && cd ecopages-app && pnpm install && pnpm dev',
								},
								{
									id: 'npm',
									label: 'npm',
									code: 'npx ecopages init ecopages-app && cd ecopages-app && npm install && npm run dev',
								},
							]}
							copyLabel="Copy init command"
							defaultSelectedKey="bun"
						/>

						<div class="home-header__actions">
							<a href="/docs/getting-started/introduction" class="button button--default">
								Read introduction
							</a>
							<a href="/docs/getting-started/installation" class="button button--outline">
								See installation
							</a>
						</div>
					</div>

					<div class="home-hero__code">
						<CodeTabs
							label="Starter files"
							tabs={[
								{
									id: 'eco-config',
									label: 'eco.config.ts',
									code: (
										<figure data-rehype-pretty-code-figure class="home-code-block">
											{unsafeHtml(configExample)}
										</figure>
									),
									content: configExampleCode,
								},
								{
									id: 'eco-component',
									label: 'eco.component.tsx',
									code: (
										<figure data-rehype-pretty-code-figure class='home-code-block'>
											{unsafeHtml(componentExample)}
										</figure>
									),
									content: componentExampleCode,
								},
								{
									id: 'home-page',
									label: 'src/pages/index.tsx',
									code: (
										<figure data-rehype-pretty-code-figure class="home-code-block">
											{unsafeHtml(pageExample)}
										</figure>
									),
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
					<div class="home-cards">
						<HomeCard
							href="/docs/getting-started/introduction"
							label="Get Started"
							title="Start with Ecopages JSX"
							description="Use the first-party Integration for internal-first DX, then expand only when your Page needs it."
						/>
						<HomeCard
							href="/docs/core/components"
							label="Core"
							title="Build with core primitives"
							description="Use eco.page and eco.component to define Pages and Components with explicit Dependencies."
						/>
						<HomeCard
							href="/docs/ecosystem/radiant"
							label="Ecosystem"
							title="Add Radiant when needed"
							description="Layer in first-party reactive Components with Radiant without leaving the Ecopages model."
						/>
						<HomeCard
							href="/docs/ecosystem/packages"
							label="Libraries"
							title="Use more first-party packages"
							description="Discover core libraries built to work together: Ecopages JSX, Radiant, routers, and processors."
						/>
					</div>
				</section>

				<section class="home-path">
					<p class="home-card__label">Suggested Path</p>
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
					<p class="home-sidebar__label">Ecosystem</p>
					<div class="home-sidebar__tags">
						<span class="home-sidebar__tag">@ecopages/core</span>
						<span class="home-sidebar__tag">@ecopages/ecopages-jsx</span>
						<span class="home-sidebar__tag">@ecopages/radiant</span>
						<span class="home-sidebar__tag">@ecopages/browser-router</span>
						<span class="home-sidebar__tag">@ecopages/postcss-processor</span>
					</div>
				</div>
			</aside>
		</div>
	);
};

HomePage.config = {
	layout: BaseLayout,
	dependencies: {
		components: [CodeTabs],
		stylesheets: ['./index.css'],
	},
};

export default HomePage;
