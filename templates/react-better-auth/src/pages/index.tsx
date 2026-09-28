import { eco } from '@ecopages/core';
import { BaseLayout } from '@/layouts/base-layout';

export default eco.page({
	layout: BaseLayout,
	metadata: () => ({
		title: 'Better Auth Example',
		description: 'The most comprehensive authentication library for TypeScript.',
	}),
	render: () => (
		<div className="space-y-16 sm:space-y-24">
			<div className="flex flex-col items-center text-center pt-16 sm:pt-24 pb-12">
				<div className="space-y-8 max-w-3xl mx-auto">
					<div className="space-y-6">
						<h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl text-on-background">
							Ecopages + Better Auth + Drizzle
						</h1>
						<p className="text-lg sm:text-xl text-muted max-w-2xl mx-auto leading-relaxed">
							The official starter template for building secure, high-performance web applications with{' '}
							<a
								href="https://ecopages.app"
								target="_blank"
								rel="noreferrer"
								className="font-bold text-on-background hover:underline decoration-2 underline-offset-2 transition-colors"
							>
								Ecopages
							</a>
							,{' '}
							<a
								href="https://www.better-auth.com"
								target="_blank"
								rel="noreferrer"
								className="font-bold text-on-background hover:underline decoration-2 underline-offset-2 transition-colors"
							>
								Better Auth
							</a>{' '}
							and{' '}
							<a
								href="https://orm.drizzle.team"
								target="_blank"
								rel="noreferrer"
								className="font-bold text-on-background hover:underline decoration-2 underline-offset-2 transition-colors"
							>
								Drizzle ORM
							</a>
							.
						</p>
					</div>
					<div className="flex flex-col sm:flex-row gap-4 flex-wrap justify-center">
						<a href="/login" className="btn btn-lg btn-primary">
							Try Demo
						</a>
						<a href="/skills" className="btn btn-lg btn-outline">
							Skills Guide
						</a>
					</div>
				</div>
			</div>
		</div>
	),
});
