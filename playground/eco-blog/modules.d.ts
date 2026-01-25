/// <reference types="@ecopages/core/declarations" />
/// <reference types="@ecopages/core/env" />
/// <reference types="@ecopages/image-processor/types" />

import '@kitajs/html';

declare module '@kitajs/html' {
	namespace JSX {
		interface IntrinsicElements {
			'radiant-editor': any;
			'radiant-input': any;
		}
	}
}
