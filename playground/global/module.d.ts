/// <reference types="@ecopages/core/declarations" />
/// <reference types="@ecopages/core/env" />
/// <reference types="@ecopages/scripts-injector/types" />
import type * as React from 'react';

type Alpine = typeof import('alpinejs').default;

interface Window {
	Alpine: Alpine;
}

declare module '*.mdx' {
	const content: string;
	export default content;
}

declare module '*.css' {
	const content: string;
	export default content;
}

declare namespace React {
	namespace JSX {
		interface IntrinsicElements {
			'react-counter': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
				'data-count'?: number | string;
			};
		}
	}
}
