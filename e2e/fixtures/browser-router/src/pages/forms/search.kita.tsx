import { eco } from '@ecopages/core';
import { BaseLayout } from '@/layouts/base-layout.kita';

type SearchProps = { term: string };

export default eco.page<SearchProps>({
	layout: BaseLayout,
	cache: 'dynamic',

	props: ({ query }) => {
		const term = query?.q;
		return { term: (Array.isArray(term) ? term[0] : term) ?? '' };
	},

	metadata: () => ({
		title: 'Search form page',
		description: 'A page with GET forms, rendered per request so it shows its query',
	}),

	render: ({ term }) => (
		<div data-testid="forms-page">
			<h1>Search form page</h1>
			<form action="/forms/search" method="get" data-testid="client-form">
				<input type="search" name="q" aria-label="Term" />
				<button type="submit">Search</button>
			</form>
			<form action="/forms/search" method="get" data-eco-reload data-testid="reload-form">
				<input type="search" name="q" aria-label="Reload term" />
				<button type="submit">Search with a reload</button>
			</form>
			<p>
				Searched for <span data-testid="term">{term}</span>
			</p>
		</div>
	),
});
