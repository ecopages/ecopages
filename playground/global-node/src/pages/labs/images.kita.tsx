import { eco } from '@ecopages/core';
import {
	ezi76Gu53NklsuUnsplashJpg,
	theodorePoncetQzephogqd7WUnsplashJpg,
	urbanVintage78A265Wpio4UnsplashJpg,
} from 'ecopages:images';
import { EcoImage } from '@ecopages/image-processor/component/html';
import { BaseLayout } from '@/layouts/base-layout';

function EziCredit() {
	return (
		<p class="text-sm text-center">
			Photo by{' '}
			<a
				class="text-blue-700 underline"
				href="https://unsplash.com/@ezi?utm_content=creditCopyText&utm_medium=referral&utm_source=unsplash"
			>
				Ezi
			</a>{' '}
			on{' '}
			<a
				class="text-blue-700 underline"
				href="https://unsplash.com/photos/a-computer-monitor-sitting-on-top-of-a-desk-76GU53nkLSU?utm_content=creditCopyText&utm_medium=referral&utm_source=unsplash"
			>
				Unsplash{' '}
			</a>
		</p>
	);
}

function TheodorPoncetCredits() {
	return (
		<p class="text-sm text-center">
			Photo by{' '}
			<a
				class="text-blue-700 underline"
				href="https://unsplash.com/@tdponcet?utm_content=creditCopyText&utm_medium=referral&utm_source=unsplash"
			>
				Theodore Poncet
			</a>{' '}
			on{' '}
			<a
				class="text-blue-700 underline"
				href="https://unsplash.com/photos/a-laptop-on-a-table-QZePhoGqD7w?utm_content=creditCopyText&utm_medium=referral&utm_source=unsplash"
			>
				Unsplash{' '}
			</a>
		</p>
	);
}

function UrbanVintageCredits() {
	return (
		<p class="text-sm text-center">
			Photo by{' '}
			<a
				class="text-blue-700 underline"
				href="https://unsplash.com/@urban_vintage?utm_content=creditCopyText&utm_medium=referral&utm_source=unsplash"
			>
				Urban Vintage
			</a>{' '}
			on{' '}
			<a
				class="text-blue-700 underline"
				href="https://unsplash.com/photos/landscape-photography-of-mountain-hit-by-sun-rays-78A265wPiO4?utm_content=creditCopyText&utm_medium=referral&utm_source=unsplash"
			>
				Unsplash{' '}
			</a>
		</p>
	);
}

export default eco.page({
	dependencies: {
		components: [BaseLayout],
	},

	metadata: () => ({
		title: 'Images Labs page',
		description: 'This is the homepage of the website',
		image: 'public/assets/images/default-og.png',
		keywords: ['typescript', 'framework', 'static'],
	}),

	render: () => {
		return (
			<BaseLayout class="grid gap-12 px-4 py-8">
				<header class="text-center">
					<h1 class="text-4xl font-bold mb-4">Image Component Showcase</h1>
					<p class="text-gray-600">Comprehensive demonstration of EcoImage component capabilities</p>
				</header>

				<section class="space-y-6">
					<h2 class="text-2xl font-semibold">Static Variants</h2>
					<p class="text-gray-600">Different preset sizes for optimized image delivery</p>
					<div class="grid grid-cols-1 md:grid-cols-3 gap-6">
						<div class="space-y-2">
							<EcoImage {...ezi76Gu53NklsuUnsplashJpg} alt="Small variant" staticVariant="sm" />
							<p class="text-sm text-center">Small Variant</p>
						</div>
						<div class="space-y-2">
							<EcoImage {...ezi76Gu53NklsuUnsplashJpg} alt="Medium variant" staticVariant="md" />
							<p class="text-sm text-center">Medium Variant</p>
						</div>
						<div class="space-y-2">
							<EcoImage {...ezi76Gu53NklsuUnsplashJpg} alt="Large variant" staticVariant="lg" />
							<p class="text-sm text-center">Large Variant</p>
						</div>
					</div>
					<EziCredit />
				</section>

				<section class="space-y-6">
					<h2 class="text-2xl font-semibold">Layout Options</h2>
					<p class="text-gray-600">Different layout modes and size combinations</p>

					<div class="grid grid-cols-1 md:grid-cols-2 gap-8">
						<div class="space-y-2">
							<EcoImage
								{...theodorePoncetQzephogqd7WUnsplashJpg}
								alt="Fixed dimensions"
								width={300}
								height={200}
								layout="fixed"
							/>
							<p class="text-sm">Fixed dimensions (300x200)</p>
						</div>
						<div class="space-y-2">
							<EcoImage
								{...theodorePoncetQzephogqd7WUnsplashJpg}
								alt="Constrained width"
								layout="constrained"
								width={400}
							/>
							<p class="text-sm">Constrained width (400px)</p>
						</div>
						<div class="space-y-2 col-span-2">
							<EcoImage
								{...theodorePoncetQzephogqd7WUnsplashJpg}
								alt="Full width"
								layout="full-width"
								height={400}
								data-ref="full-width"
							/>
							<p class="text-sm">Full width layout with defined height</p>
						</div>
					</div>
					<TheodorPoncetCredits />
				</section>

				<section class="space-y-6">
					<h2 class="text-2xl font-semibold">Grid Behavior</h2>
					<p class="text-gray-600">Images in responsive grid layouts with different properties</p>

					<div class="grid grid-cols-2 md:grid-cols-4 gap-4">
						{Array.from({ length: 4 }).map((_, index) => (
							<div class="space-y-2">
								<EcoImage
									{...urbanVintage78A265Wpio4UnsplashJpg}
									alt={`Grid item ${index + 1}`}
									staticVariant="sm"
									layout="full-width"
									unstyled={index === 3}
									priority={index === 0}
								/>
								<p class="text-sm text-center">
									{index === 3 ? 'Unstyled' : index === 0 ? 'Priority Load' : 'Standard'}
									{' | Static Variant "sm"'}
								</p>
							</div>
						))}
					</div>
					<UrbanVintageCredits />
				</section>

				<section class="space-y-6">
					<h2 class="text-2xl font-semibold">Class and Styles Overrides</h2>
					<p class="text-gray-600">Demonstrating class and style overrides for EcoImage component</p>

					<div class="grid grid-cols-1 md:grid-cols-2 gap-8">
						<div class="space-y-2">
							<EcoImage
								{...ezi76Gu53NklsuUnsplashJpg}
								alt="Class override"
								class="rounded-lg"
								layout="constrained"
								width={400}
							/>
							<p class="text-sm">Class override with constrained layout</p>
						</div>
						<div class="space-y-2">
							<EcoImage
								{...ezi76Gu53NklsuUnsplashJpg}
								alt="Style override"
								style="border:8px solid red;"
								layout="constrained"
								width={400}
							/>
							<p class="text-sm">Style override with constrained layout</p>
						</div>
					</div>
					<EziCredit />
				</section>

				<section>
					<a href="/labs/client-images" class="text-blue-700 underline">
						Go to client images
					</a>
				</section>
			</BaseLayout>
		);
	},
});
