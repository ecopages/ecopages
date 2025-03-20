/**
 * Image component that renders the image as a string.
 * @module
 */

import { type RenderImageToString, renderer } from '../shared/image-renderer-provider';

/**
 * EcoImage
 * This component generates the image element based on the provided props as a string
 * @param props {@link RenderImageToString}
 */
export const EcoImage = (props: RenderImageToString) => {
  return renderer.renderToString(props);
};
