import { eco } from '@ecopages/core';
import { BaseLayout } from '@/layouts/base-layout.kita';

export default eco.page({
	layout: BaseLayout,

	dependencies: {
		scripts: ['./probe.script.ts'],
	},

	render: () => (
		<div data-testid="hmr-soft-reload-page">
			<h1>HMR soft reload</h1>
			<p id="page-note">note-v1</p>
			<x-counter id="light">
				<button type="button">Count: 0</button>
			</x-counter>
			<x-shadow-counter id="shadow">
				<template shadowrootmode="open">
					<button type="button">Count: 0</button>
				</template>
			</x-shadow-counter>
			<div id="plain">plain</div>
			<x-counter id="persisted" data-eco-persist="persisted-counter">
				<button type="button">Count: 0</button>
			</x-counter>
		</div>
	),
});
