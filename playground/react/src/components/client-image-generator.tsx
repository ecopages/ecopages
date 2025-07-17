import {
	ezi76Gu53NklsuUnsplashJpg,
	theodorePoncetQzephogqd7WUnsplashJpg,
	urbanVintage78A265Wpio4UnsplashJpg,
} from 'ecopages:images';
import type { EcoComponent } from '@ecopages/core';
import { EcoImage } from '@ecopages/image-processor/component/react';
import { type JSX, useMemo, useState } from 'react';

const availableImages = [
	ezi76Gu53NklsuUnsplashJpg,
	theodorePoncetQzephogqd7WUnsplashJpg,
	urbanVintage78A265Wpio4UnsplashJpg,
];

export const ClientImageGenerator: EcoComponent<unknown, JSX.Element> = () => {
	const [randomIndex, setRandomIndex] = useState<number | undefined>();

	const clientSideImages = useMemo(() => {
		if (randomIndex === undefined) return null;

		const imageProps = availableImages[randomIndex];

		return (
			<>
				<EcoImage {...imageProps} alt="Random image" layout="full-width" height={200} priority />
				<EcoImage {...imageProps} alt="Random image" width={600} height={200} layout="constrained" priority />
				<EcoImage {...imageProps} alt="Random image" layout="fixed" width={200} height={200} priority />
				<EcoImage {...imageProps} alt="Random image" width={400} priority unstyled data-test="attribute" />
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
				onClick={() => setRandomIndex(Math.floor(Math.random() * availableImages.length))}
				className="px-4 py-2 bg-blue-800 text-white rounded-md"
			>
				Randomize
			</button>
			{clientSideImages}
		</>
	);
};

ClientImageGenerator.config = {
	importMeta: import.meta,
};

export default ClientImageGenerator;
