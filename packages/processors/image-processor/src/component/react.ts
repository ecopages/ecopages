/**
 * Image component that renders the image as a string.
 * @module @ecopages/image-processor/component/react
 */

import { createElement, type JSX } from 'react';
import { type EcoImageProps, renderer } from '../image-renderer';

/**
 * EcoImage
 * This component generates the image element based on the provided props as JSX
 * @param props {@link EcoImageProps}
 * @returns
 */
export const EcoImage = (props: EcoImageProps): JSX.Element => {
  return createElement('img', {
    ...renderer.generateAttributesJsx(props),
    suppressHydrationWarning: true,
  });
};
