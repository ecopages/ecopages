import { eco } from '@ecopages/core';
import { css, html } from '@ecopages/core';
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

const BLUE = '#2563EB';
const property = 'border-color';

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
					<!-- @todo?: This is not working now due the fact we removed PostCssProcessor as a dependency -->
						${await css`
						.gradient-text {
							@apply inline-block bg-gradient-to-b from-blue-600 via-green-500 to-indigo-400 bg-clip-text text-7xl text-transparent;
							@apply border-4 rounded-xl p-4;
							${property}: ${BLUE};
						}`}
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
