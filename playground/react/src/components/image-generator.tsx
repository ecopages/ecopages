import images from 'ecopages:images';
import type { EcoComponent } from '@ecopages/core';
import { EcoImage } from '@ecopages/image-processor/component/react';
import { type JSX, useMemo, useState } from 'react';

const srcs = [
  'theodore-poncet-QZePhoGqD7w-unsplash.jpg',
  'ezi-76GU53nkLSU-unsplash.jpg',
  'urban-vintage-78A265wPiO4-unsplash.jpg',
];

export const ImageGeneration: EcoComponent<unknown, JSX.Element> = () => {
  const [randomIndex, setRandomIndex] = useState<number | undefined>();

  const clientSideImages = useMemo(() => {
    if (randomIndex === undefined) return null;

    const imageProps = images[srcs[randomIndex]];

    return (
      <>
        <EcoImage {...imageProps} alt="Random image" layout="full-width" height={200} priority />
        <EcoImage {...imageProps} alt="Random image" width={600} height={200} layout="constrained" priority />
        <EcoImage {...imageProps} alt="Random image" layout="fixed" width={200} height={200} priority />
        <EcoImage {...imageProps} alt="Random image" priority unstyled data-test="attribute" />
        <EcoImage {...imageProps} alt="Random image" priority width={300} aspectRatio="4/1" />
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <EcoImage
              key={`img-${index}`}
              {...imageProps}
              alt="Demo"
              staticVariant="sm"
              layout="full-width"
              unstyled={index === 3}
            />
          ))}
        </div>
      </>
    );
  }, [randomIndex]);

  return (
    <>
      <button
        type="button"
        onClick={() => setRandomIndex(Math.floor(Math.random() * srcs.length))}
        className="px-4 py-2 bg-blue-800 text-white rounded-md"
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
