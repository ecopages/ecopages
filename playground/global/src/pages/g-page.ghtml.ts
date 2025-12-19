import { css, type EcoComponent, html, resolveComponentsScripts } from '@ecopages/core';
import type { ScriptInjectorProps } from '@ecopages/scripts-injector';
import { RadiantCounter } from '@/components/radiant-counter';

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

const RadiantCounterGhtml = () => {
	return html`<radiant-counter count="0">
		<button type="button" data-ref="decrement" aria-label="Decrement">-</button>
		<span data-ref="count">0</span>
		<button type="button" data-ref="increment" aria-label="Increment">+</button>
	</radiant-counter>`;
};

const Island = ({ children, ...props }: ScriptInjectorProps & { children: () => string }) => {
	return html`<scripts-injector on:interaction=${props['on:interaction']} scripts="${props.scripts}">
		!${children()}
	</scripts-injector>`;
};

const BLUE = '#2563EB';
const property = 'border-color';

const GhtmlPage: EcoComponent = async () => {
	const data = await getAsyncData();

	return html`
		<body>
			<style>
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
					!${Island({
						'on:interaction': 'mouseenter,focusin',
						scripts: resolveComponentsScripts([RadiantCounter]),
						children: RadiantCounterGhtml,
					})}
					!${await AsyncComponent()}
				</div>
			</main>
			<script>
				console.log('GhtmlPage script');
			</script>
		</body>
	`;
};

GhtmlPage.config = {
	dependencies: {
		components: [RadiantCounter],
	},
};

export default GhtmlPage;
