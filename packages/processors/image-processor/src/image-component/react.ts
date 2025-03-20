/**
 * JSX component for rendering an image.
 * @module
 */

import { createElement } from 'react';
import { type RenderImageToString, renderer } from '../shared/image-renderer-provider';

/**
 * This component generates the image element based on the provided props as a string
 * @param props {@link RenderImageToString}
 * @returns
 */
export const EcoImage = (props: RenderImageToString) => {
  const attributes = renderer.generateAttributesJsx(props);
  if (!attributes) return null;
  return createElement('img', attributes);
};
