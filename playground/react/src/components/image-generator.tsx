import type { EcoComponent } from '@ecopages/core';
import { EcoImage } from '@ecopages/image-processor/image-component/react';
import { type JSX, useMemo, useState } from 'react';

const srcs = [
  '/public/assets/images/theodore-poncet-QZePhoGqD7w-unsplash.jpg',
  '/public/assets/images/ezi-76GU53nkLSU-unsplash.jpg',
  '/public/assets/images/urban-vintage-78A265wPiO4-unsplash.jpg',
];

export const ImageGeneration: EcoComponent<unknown, JSX.Element> = () => {
  const [randomIndex, setRandomIndex] = useState<number | undefined>();

  const clientSideImages = useMemo(() => {
    if (randomIndex === undefined) return null;

    const src = srcs[randomIndex];

    console.log('src', src);

    return (
      <>
        <EcoImage src={src} alt="Random image" layout="full-width" height={200} priority />
        <EcoImage src={src} alt="Random image" width={600} height={200} layout="constrained" priority />
        <EcoImage src={src} alt="Random image" layout="fixed" width={200} height={200} priority />
        <EcoImage src={src} alt="Random image" priority unstyled data-test="attribute" />
        <EcoImage src={src} alt="Random image" priority width={300} aspectRatio="4/1" />
      </>
    );
  }, [randomIndex]);

  return (
    <>
      <button
        type="button"
        onClick={() => setRandomIndex(Math.floor(Math.random() * srcs.length))}
        className="px-4 py-2 bg-blue-500 text-white rounded-md"
      >
        Randomize
      </button>
      {clientSideImages}
    </>
  );
};

ImageGeneration.config = {
  importMeta: import.meta,
};

export default ImageGeneration;
