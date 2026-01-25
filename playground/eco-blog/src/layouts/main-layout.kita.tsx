import { eco } from '@ecopages/core';
import type { PropsWithChildren } from '@kitajs/html';

export const MainLayout = eco.component<PropsWithChildren<{}>>({
	render: ({ children }) => {
		return (
			<body class="bg-slate-50 text-slate-900 font-sans antialiased min-h-screen flex flex-col">
				<header class="bg-white border-b border-slate-200 py-4 sticky top-0 z-10">
					<div class="container mx-auto px-4 flex justify-between items-center">
						<a
							href="/"
							class="text-2xl font-bold tracking-tight bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent italic"
						>
							EcoBlog
						</a>
						<nav class="flex gap-6 items-center">
							<a href="/" class="text-sm font-medium hover:text-indigo-600 transition-colors">
								Home
							</a>
							<a
								href="/admin"
								class="text-sm font-medium text-slate-500 hover:text-indigo-600 transition-colors"
							>
								Author Area
							</a>
						</nav>
					</div>
				</header>
				<main class="flex-1 container mx-auto px-4 py-8">{children as 'safe'}</main>
				<footer class="bg-white border-t border-slate-200 py-8 mt-12">
					<div class="container mx-auto px-4 text-center text-slate-500 text-sm">
						&copy; {new Date().getFullYear()} EcoBlog. Powered by Ecopages.
					</div>
				</footer>
			</body>
		);
	},
});
