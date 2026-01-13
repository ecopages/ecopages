import { eco } from '@ecopages/core';
import type { Error404TemplateProps } from '@ecopages/core';
import { BaseLayout } from '@/layouts/base-layout.kita';

export default eco.page<Error404TemplateProps>({
	dependencies: {
		components: [BaseLayout],
	},

	render: () => {
		return (
			<BaseLayout>
				<div class="max-w-2xl mx-auto text-center flex flex-col items-center justify-center min-h-[50vh] space-y-8">
					<div class="space-y-4">
						<h1 class="text-8xl md:text-9xl font-bold tracking-tight bg-clip-text text-transparent bg-linear-to-br from-white via-gray-200 to-gray-500">
							404
						</h1>
						<h2 class="text-2xl md:text-3xl font-bold text-white">Page Not Found</h2>
						<p class="text-gray-400 text-lg">
							The page you are looking for doesn't exist or has been moved.
						</p>
					</div>

					<div class="pt-8">
						<a
							href="/"
							class="inline-flex items-center justify-center px-6 py-3 rounded-lg bg-white text-black font-semibold hover:bg-gray-200 transition-colors"
						>
							Return Home
						</a>
					</div>
				</div>
			</BaseLayout>
		);
	},
});
