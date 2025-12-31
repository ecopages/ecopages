import { BaseLayout } from '@/layouts/base-layout';

export default function HomePage() {
	return (
		<BaseLayout>
			<div className="max-w-7xl mx-auto space-y-12">
				<section className="space-y-4 text-center md:text-left">
					<h1 className="text-4xl md:text-5xl font-bold tracking-tight text-surface-900 dark:text-white">
						Tailwind v4 Integration Demo
					</h1>
					<p className="text-lg text-surface-600 dark:text-surface-400 max-w-2xl mx-auto md:mx-0">
						This page demonstrates the technical integration of Tailwind CSS v4, including custom
						configuration via CSS variables, automatic{' '}
						<code className="bg-surface-200 dark:bg-surface-800 px-1.5 py-0.5 rounded text-sm text-primary-600 dark:text-primary-400">
							@reference
						</code>{' '}
						injection, and dark mode support.
					</p>
				</section>

				<div className="grid grid-cols-1 md:grid-cols-4 gap-6">
					<div className="md:col-span-2 p-6 rounded-md border border-surface-200 dark:border-surface-800 bg-surface-50 dark:bg-surface-900/50">
						<h3 className="text-lg font-bold mb-4 text-surface-900 dark:text-white flex items-center gap-2">
							<span className="w-2 h-2 rounded-full bg-primary-500"></span>
							Theme Configuration via CSS
						</h3>
						<div className="space-y-4">
							<div className="grid grid-cols-2 gap-4">
								<div className="space-y-2">
									<p className="text-xs font-medium text-surface-500 uppercase tracking-wide">
										Primary Palette
									</p>
									<div className="flex gap-1">
										{[
											'bg-primary-500',
											'bg-primary-600',
											'bg-primary-700',
											'bg-primary-800',
											'bg-primary-900',
										].map((className) => (
											<div
												key={className}
												className={`h-8 w-full rounded-sm ${className}`}
												title={className.replace('bg-', '')}
											/>
										))}
									</div>
								</div>
								<div className="space-y-2">
									<p className="text-xs font-medium text-surface-500 uppercase tracking-wide">
										Accent Palette
									</p>
									<div className="flex gap-1">
										{[
											'bg-accent-500',
											'bg-accent-600',
											'bg-accent-700',
											'bg-accent-800',
											'bg-accent-900',
										].map((className) => (
											<div
												key={className}
												className={`h-8 w-full rounded-sm ${className}`}
												title={className.replace('bg-', '')}
											/>
										))}
									</div>
								</div>
							</div>
							<div className="mt-4 p-4 bg-surface-950 rounded-md font-mono text-xs text-surface-300 border border-surface-800 overflow-x-auto">
								<span className="text-accent-400">@theme</span> {'{'}
								<div className="pl-4 text-surface-400">/* Defined in src/styles/theme.css */</div>
								<div className="pl-4">
									<span className="text-primary-400">--color-primary-500</span>:{' '}
									<span className="text-white">oklch(0.6 0.18 200)</span>;
								</div>
								<div className="pl-4">
									<span className="text-primary-400">--color-accent-500</span>:{' '}
									<span className="text-white">oklch(0.58 0.24 280)</span>;
								</div>
								{'}'}
							</div>
						</div>
					</div>

					<div className="md:col-span-2 p-6 rounded-md border border-surface-200 dark:border-surface-800 bg-surface-50 dark:bg-surface-900/50 relative overflow-hidden group">
						<div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
							<svg
								width="100"
								height="100"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="1"
								className="text-primary-500"
							>
								<path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
							</svg>
						</div>
						<h3 className="text-lg font-bold mb-4 text-surface-900 dark:text-white flex items-center gap-2">
							<span className="w-2 h-2 rounded-full bg-accent-500"></span>
							External @apply Support
						</h3>
						<p className="text-sm text-surface-600 dark:text-surface-400 mb-6">
							The{' '}
							<code className="text-xs bg-surface-200 dark:bg-surface-800 px-1 rounded">
								@ecopages/postcss-processor
							</code>{' '}
							automatically injects{' '}
							<code className="text-xs font-bold text-accent-600 dark:text-accent-400">@reference</code>{' '}
							imports, allowing you to use custom theme utilities in separate files.
						</p>

						{/* Component styled in index.css */}
						<div className="demo-card">
							<span className="demo-badge">Styled in index.css</span>
							<p className="text-sm">
								This card uses classes like <code className="text-xs">bg-surface-900</code> and{' '}
								<code className="text-xs">text-surface-300</code> inside the{' '}
								<code className="text-xs">index.css</code> file.
							</p>
						</div>
					</div>

					<div className="md:col-span-1 p-6 rounded-md border border-surface-200 dark:border-surface-800 bg-surface-50 dark:bg-surface-900/50">
						<h3 className="text-lg font-bold mb-4 text-surface-900 dark:text-white">Typography</h3>
						<div className="space-y-4">
							<div>
								<span className="text-surface-400 text-xs uppercase block mb-1">Heading 1</span>
								<span className="text-3xl font-bold text-surface-900 dark:text-surface-50 tracking-tight">
									Inter Bold
								</span>
							</div>
							<div>
								<span className="text-surface-400 text-xs uppercase block mb-1">Body</span>
								<span className="text-base text-surface-700 dark:text-surface-300 leading-relaxed">
									The quick brown fox jumps over the lazy dog.
								</span>
							</div>
						</div>
					</div>

					<div className="md:col-span-3 p-6 rounded-md border border-surface-200 dark:border-surface-800 bg-surface-50 dark:bg-surface-900/50 flex flex-col justify-center">
						<h3 className="text-lg font-bold mb-4 text-surface-900 dark:text-white">
							Interactive States & Dark Mode
						</h3>
						<div className="flex flex-wrap gap-4 items-center">
							<button className="px-4 py-2 bg-primary-500 hover:bg-primary-600 active:bg-primary-700 text-white rounded-md transition-colors shadow-sm font-medium">
								Primary Button
							</button>
							<button className="px-4 py-2 border border-surface-300 dark:border-surface-700 hover:border-primary-500 dark:hover:border-primary-500 text-surface-700 dark:text-surface-300 hover:text-primary-600 dark:hover:text-primary-400 rounded-md transition-colors bg-white dark:bg-transparent font-medium">
								Secondary Button
							</button>
							<div className="h-8 w-px bg-surface-200 dark:bg-surface-800 mx-2 hidden md:block"></div>
							<span className="text-sm text-surface-500 w-full md:w-auto">
								Try toggling the theme in the header ↗
							</span>
						</div>
					</div>
				</div>
			</div>
		</BaseLayout>
	);
}

HomePage.config = {
	dependencies: {
		components: [BaseLayout],
		stylesheets: ['./index.css'],
	},
};
