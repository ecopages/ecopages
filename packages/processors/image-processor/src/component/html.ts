/**
 * Image component that renders the image as a string.
 * @module @ecopages/image-processor/component/html
 */

import { type EcoImageProps, renderer } from '../image-renderer';

/**
 * EcoImage
 * This component generates the image element based on the provided props as a string
 * @param props {@link EcoImageProps}
 */
export const EcoImage = (props: EcoImageProps): string => {
	return renderer.renderToString(props);
};
