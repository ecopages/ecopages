import { type JSX, createElement } from 'react';
import { type RenderImageToString, renderer } from '../shared/image-renderer-provider';

/**
 * Isomorphic image component
 * This component is used to render images on the client and server
 * @param props {@link RenderImageToString}
 * @returns
 */
export const EcoImage = (props: RenderImageToString): JSX.Element => {
  return createElement('img', {
    ...renderer.generateAttributesJsx(props),
    suppressHydrationWarning: true,
  });
};
