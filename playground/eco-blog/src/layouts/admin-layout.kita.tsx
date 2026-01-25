import { eco } from '@ecopages/core';
import type { PropsWithChildren } from '@kitajs/html';

export const AdminLayout = eco.component<PropsWithChildren<{}>>({
	render: ({ children }) => {
		return (
			<body class="bg-gray-50 text-slate-900 font-sans antialiased min-h-screen flex flex-col">
				<header class="bg-white border-b border-slate-200 py-3 sticky top-0 z-50">
					<div class="px-6 flex justify-between items-center">
						<div class="flex items-center gap-4">
							<a href="/" class="text-xl font-bold tracking-tight text-indigo-600 italic">
								EcoBlog <span class="text-slate-400 font-normal not-italic ml-2">Admin</span>
							</a>
						</div>
						<div class="flex items-center gap-4">
							<div class="h-8 w-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-500">
								AD
							</div>
						</div>
					</div>
				</header>
				<div class="flex flex-1">
					<aside class="w-64 bg-white border-r border-slate-200 p-6 hidden md:block">
						<nav class="space-y-1">
							<a
								href="/admin"
								class="flex items-center px-3 py-2 text-sm font-medium rounded-md bg-slate-100 text-slate-900"
							>
								All Posts
							</a>
							<a
								href="/admin/new"
								class="flex items-center px-3 py-2 text-sm font-medium rounded-md text-slate-600 hover:bg-slate-50 hover:text-slate-900"
							>
								New Post
							</a>
							<div class="pt-4 mt-4 border-t border-slate-100">
								<a
									href="/"
									class="flex items-center px-3 py-2 text-sm font-medium rounded-md text-slate-600 hover:bg-slate-50 hover:text-slate-900"
								>
									View Site
								</a>
							</div>
						</nav>
					</aside>
					<main class="flex-1 p-8 overflow-auto">{children as 'safe'}</main>
				</div>
			</body>
		);
	},
});
