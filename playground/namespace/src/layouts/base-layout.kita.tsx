import { eco } from '@ecopages/core';
import type { EcoPagesElement } from '@ecopages/core';

type LayoutProps = {
	children: EcoPagesElement;
};

export const BaseLayout = eco.component<LayoutProps>({
	dependencies: {
		scripts: ['./base-layout.script.ts'],
	},
	render: ({ children }) => (
		<div class="min-h-screen bg-black text-white selection:bg-purple-500/30 selection:text-purple-200">
			<header class="fixed top-0 w-full z-10 border-b border-white/10 bg-black/50 backdrop-blur-md supports-backdrop-filter:bg-black/20">
				<div class="container mx-auto px-6 h-16 flex items-center justify-between">
					<div class="flex items-center gap-2">
						<h1 class="text-sm font-semibold tracking-tight text-gray-100">Eco Namespace</h1>
					</div>
				</div>
			</header>
			<main class="container mx-auto px-6 pt-32 pb-20">{children}</main>
			<footer class="border-t border-white/10 py-12">
				<div class="container mx-auto px-6 text-center text-sm text-gray-500">
					<p>Built with ecopages + eco namespace</p>
				</div>
			</footer>
		</div>
	),
});
