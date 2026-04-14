import { eco } from '@ecopages/core';
import { BaseLayout } from '@/layouts/base-layout';

interface MatrixCardProps {
	label: string;
	title: string;
	description: string;
	href: string;
	testId: string;
}

function MatrixCard({ label, title, description, href, testId }: MatrixCardProps) {
	return (
		<a class="card space-y-3 block" href={href} data-testid={testId}>
			<p class="text-xs uppercase tracking-[0.24em] text-sky-600">{label}</p>
			<h2 class="font-display text-2xl font-semibold tracking-tight">{title}</h2>
			<p class="text-sm leading-7 text-muted">{description}</p>
		</a>
	);
}

export default eco.page({
	dependencies: {
		components: [BaseLayout],
		stylesheets: ['./integration-matrix.css'],
	},
	layout: BaseLayout,
	metadata: () => ({
		title: 'Integration Matrix',
		description: 'Generic hub page for the dedicated integration matrix entry routes in the kitchen sink.',
	}),
	render: () => (
		<div class="space-y-8" data-testid="page-integration-matrix-index">
			<section class="card space-y-4">
				<p class="text-xs font-semibold uppercase tracking-[0.28em] text-sky-600">Integration matrix hub</p>
				<h1 class="font-display text-4xl font-semibold tracking-tight">
					Choose the entry route you want to validate.
				</h1>
				<p class="max-w-3xl text-base leading-8 text-muted">
					The real integration coverage lives on the dedicated route files for Kita, Lit, React, and Ecopages
					JSX. This index stays neutral and just links to those concrete matrix pages.
				</p>
			</section>

			<section class="grid gap-4 lg:grid-cols-2">
				<MatrixCard
					label="Kita matrix"
					title="Kita host"
					description="Inspect the full broad shell matrix under the explicit Kita-owned route."
					href="/integration-matrix/kita"
					testId="matrix-link-kita"
				/>
				<MatrixCard
					label="Lit matrix"
					title="Lit host"
					description="Validate the Lit-first route with nested Kita, React, and counter coverage."
					href="/integration-matrix/lit-entry"
					testId="matrix-link-lit"
				/>
				<MatrixCard
					label="React matrix"
					title="React host"
					description="Validate the React-owned shell entry plus the nested Kita and Lit content."
					href="/integration-matrix/react-entry"
					testId="matrix-link-react"
				/>
				<MatrixCard
					label="Ecopages JSX matrix"
					title="Ecopages JSX host"
					description="Validate the Ecopages JSX entry plus Radiant SSR and hydration behavior."
					href="/integration-matrix/ecopages-jsx-entry"
					testId="matrix-link-ecopages-jsx"
				/>
			</section>

			<section class="card space-y-4">
				<p class="text-xs uppercase tracking-[0.24em] text-muted">Quick links</p>
				<div class="flex flex-wrap gap-3 text-sm">
					<a class="button button--primary" href="/integration-matrix/kita">
						Open Kita matrix
					</a>
					<a class="button button--secondary" href="/integration-matrix/lit-entry">
						Open Lit entry
					</a>
					<a class="button button--secondary" href="/integration-matrix/react-entry">
						Open React entry
					</a>
					<a class="button button--secondary" href="/integration-matrix/ecopages-jsx-entry">
						Open Ecopages JSX entry
					</a>
				</div>
			</section>
		</div>
	),
});
