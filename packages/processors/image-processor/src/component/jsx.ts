/**
 * Image component that renders as an Ecopages JSX element.
 * @module @ecopages/image-processor/component/jsx
 */

import { jsx, type JsxRenderable } from '@ecopages/jsx';
import { type EcoImageProps, renderer } from '../image-renderer.ts';

/**
 * EcoImage
 * This component generates the image element based on the provided props as JSX
 * @param props {@link EcoImageProps}
 */
export const EcoImage = (props: EcoImageProps): JsxRenderable => {
	const attributes = renderer.generateAttributes(props);
	if (!attributes) {
		return null;
	}

	return jsx('img', attributes);
};
