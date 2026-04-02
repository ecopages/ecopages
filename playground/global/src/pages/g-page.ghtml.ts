import { eco } from '@ecopages/core';
import { html } from '@ecopages/core/html';

import { RadiantCounter } from '@/components/radiant-counter';
import { BaseLayout } from '@/layouts/base-layout';

function getAsyncData(): Promise<{
	username: string;
	age: number;
}> {
	return new Promise((resolve) => {
		setTimeout(() => {
			resolve({
				username: 'John',
				age: 21,
			});
		}, 500);
	});
}

const AsyncComponent = async () => {
	const asyncElement = new Promise((resolve) => {
		setTimeout(() => {
			resolve(`${new Date().toLocaleTimeString()}`);
		}, 500);
	});

	return html`<p
		class="px-4 py-2 max-w-fit border-slate-500 border-2 bg-slate-200 font-mono text-slate-800 rounded-md"
	>
		!${await asyncElement}
	</p>`;
};

export default eco.page({
	dependencies: {
		components: [RadiantCounter],
	},
	layout: BaseLayout,
	render: async () => {
		const data = await getAsyncData();

		return html`
			<body>
				<style>
					.gradient-text {
						display: inline-block;
						background: linear-gradient(to bottom, #2563eb, #22c55e, #818cf8);
						-webkit-background-clip: text;
						background-clip: text;
						color: transparent;
						font-size: 4.5rem;
						line-height: 1;
						border: 4px solid #2563eb;
						border-radius: 0.75rem;
						padding: 1rem;
					}
				</style>
				<main class="container p-4">
					<div class="flex flex-col gap-4">
						<p class="gradient-text">Data</p>
						<ul>
							!${Object.entries(data).map(([key, val]) => html`<li>${key}: ${val}</li>`)}
						</ul>
						!${RadiantCounter({ count: 0 })} !${await AsyncComponent()}
					</div>
				</main>
				<script>
					console.log('GhtmlPage script');
				</script>
			</body>
		`;
	},
});
