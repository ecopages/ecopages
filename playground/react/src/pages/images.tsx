import {
  ezi76Gu53NklsuUnsplashJpg,
  theodorePoncetQzephogqd7WUnsplashJpg,
  urbanVintage78A265Wpio4UnsplashJpg,
} from 'ecopages:images';
import type { EcoComponent, GetMetadata } from '@ecopages/core';
import { EcoImage } from '@ecopages/image-processor/component/react';
import type { JSX } from 'react';
import { ClientImageGenerator } from '@/components/client-image-generator';
import { BaseLayout } from '@/layouts/base-layout';

export const getMetadata: GetMetadata = () => ({
  title: 'Images Labs page',
  description: 'This is the test page for images',
  image: 'public/assets/images/default-og.png',
  keywords: ['typescript', 'framework', 'static'],
});

const ImagesPage: EcoComponent<unknown, JSX.Element> = () => {
  return (
    <BaseLayout className="grid gap-12 px-4 py-8">
      <a href="/" className="text-blue-700 underline">
        Home
      </a>
      <header className="text-center">
        <h1 className="text-4xl font-bold mb-4">Image Component Showcase</h1>
        <p className="text-gray-600">Comprehensive demonstration of EcoImage component capabilities</p>
      </header>

      {/* Static Variants Section */}
      <section className="space-y-6">
        <h2 className="text-2xl font-semibold">Static Variants</h2>
        <p className="text-gray-600">Different preset sizes for optimized image delivery</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-2">
            <EcoImage {...ezi76Gu53NklsuUnsplashJpg} alt="Small variant" staticVariant="sm" />
            <p className="text-sm text-center">Small Variant</p>
          </div>
          <div className="space-y-2">
            <EcoImage {...ezi76Gu53NklsuUnsplashJpg} alt="Medium variant" staticVariant="md" />
            <p className="text-sm text-center">Medium Variant</p>
          </div>
          <div className="space-y-2">
            <EcoImage {...ezi76Gu53NklsuUnsplashJpg} alt="Large variant" staticVariant="lg" />
            <p className="text-sm text-center">Large Variant</p>
          </div>
        </div>
        <EziCredit />
      </section>

      {/* Layout Options Section */}
      <section className="space-y-6">
        <h2 className="text-2xl font-semibold">Layout Options</h2>
        <p className="text-gray-600">Different layout modes and size combinations</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-2">
            <EcoImage
              {...theodorePoncetQzephogqd7WUnsplashJpg}
              alt="Fixed dimensions"
              width={300}
              height={200}
              layout="fixed"
            />
            <p className="text-sm">Fixed dimensions (300x200)</p>
          </div>
          <div className="space-y-2">
            <EcoImage
              {...theodorePoncetQzephogqd7WUnsplashJpg}
              alt="Constrained width"
              layout="constrained"
              width={400}
            />
            <p className="text-sm">Constrained width (400px)</p>
          </div>
          <div className="space-y-2 col-span-2">
            <EcoImage {...theodorePoncetQzephogqd7WUnsplashJpg} alt="Full width" layout="full-width" height={400} />
            <p className="text-sm">Full width layout with defined height</p>
          </div>
        </div>
        <TheodorPoncetCredits />
      </section>

      {/* Grid Behavior Section */}
      <section className="space-y-6">
        <h2 className="text-2xl font-semibold">Grid Behavior</h2>
        <p className="text-gray-600">Images in responsive grid layouts with different properties</p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div className="space-y-2" key={`item-${index}`}>
              <EcoImage
                {...urbanVintage78A265Wpio4UnsplashJpg}
                alt={`Grid item ${index + 1}`}
                staticVariant="sm"
                layout="full-width"
                unstyled={index === 3}
                priority={index === 0}
              />
              <p className="text-sm text-center">
                {index === 3 ? 'Unstyled' : index === 0 ? 'Priority Load' : 'Standard'}
                {' | Static Variant "sm"'}
              </p>
            </div>
          ))}
        </div>
        <UrbanVintageCredits />
      </section>

      {/* Class and styles overrides */}
      <section className="space-y-6">
        <h2 className="text-2xl font-semibold">Class and Styles Overrides</h2>
        <p className="text-gray-600">Demonstrating class and style overrides for EcoImage component</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-2">
            <EcoImage
              {...ezi76Gu53NklsuUnsplashJpg}
              alt="Class override"
              className="rounded-lg"
              layout="constrained"
              width={400}
            />
            <p className="text-sm">Class override with constrained layout</p>
          </div>
          <div className="space-y-2">
            <EcoImage
              {...ezi76Gu53NklsuUnsplashJpg}
              alt="Style override"
              style={{ border: '8px solid red' }}
              layout="constrained"
              width={400}
            />
            <p className="text-sm">Style override with constrained layout</p>
          </div>
        </div>
        <EziCredit />
      </section>

      {/* Client Generation Section */}
      <section className="space-y-6">
        <h2 className="text-2xl font-semibold">Client Generation</h2>
        <p className="text-gray-600">Image generation on the client side</p>
        <p className="text-sm">
          The following image is generated on the client side using the ClientImageGenerator component, it stores the
          image metadata of the imported images from the virtual module. Thanks to the three-shaking capabilities of
          Ecopages, only the necessary images are included in the final bundle.
        </p>
        <ClientImageGenerator />
      </section>
    </BaseLayout>
  );
};

function EziCredit() {
  return (
    <p className="text-sm text-center">
      Photo by{' '}
      <a
        className="text-blue-700 underline"
        href="https://unsplash.com/@ezi?utm_content=creditCopyText&utm_medium=referral&utm_source=unsplash"
      >
        Ezi
      </a>{' '}
      on{' '}
      <a
        className="text-blue-700 underline"
        href="https://unsplash.com/photos/a-computer-monitor-sitting-on-top-of-a-desk-76GU53nkLSU?utm_content=creditCopyText&utm_medium=referral&utm_source=unsplash"
      >
        Unsplash{' '}
      </a>
    </p>
  );
}

function TheodorPoncetCredits() {
  return (
    <p className="text-sm text-center">
      Photo by{' '}
      <a
        className="text-blue-700 underline"
        href="https://unsplash.com/@tdponcet?utm_content=creditCopyText&utm_medium=referral&utm_source=unsplash"
      >
        Theodore Poncet
      </a>{' '}
      on{' '}
      <a
        className="text-blue-700 underline"
        href="https://unsplash.com/photos/a-laptop-on-a-table-QZePhoGqD7w?utm_content=creditCopyText&utm_medium=referral&utm_source=unsplash"
      >
        Unsplash{' '}
      </a>
    </p>
  );
}

function UrbanVintageCredits() {
  return (
    <p className="text-sm text-center">
      Photo by{' '}
      <a
        className="text-blue-700 underline"
        href="https://unsplash.com/@urban_vintage?utm_content=creditCopyText&utm_medium=referral&utm_source=unsplash"
      >
        Urban Vintage
      </a>{' '}
      on{' '}
      <a
        className="text-blue-700 underline"
        href="https://unsplash.com/photos/landscape-photography-of-mountain-hit-by-sun-rays-78A265wPiO4?utm_content=creditCopyText&utm_medium=referral&utm_source=unsplash"
      >
        Unsplash{' '}
      </a>
    </p>
  );
}

ImagesPage.config = {
  importMeta: import.meta,
  dependencies: {
    components: [BaseLayout],
  },
};

export default ImagesPage;
