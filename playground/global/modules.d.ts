/// <reference path="../../node_modules/@ecopages/core/src/declarations.d.ts" />
/// <reference path="../../node_modules/@ecopages/core/src/env.d.ts" />
/// <reference path="../../node_modules/@ecopages/scripts-injector/types.d.ts" />
/// <reference path="../../node_modules/@ecopages/image-processor" />
/// <reference path="node_modules/@types/ecopages-image-processor/virtual-module.d.ts" />

import type Alpine from 'alpinejs';

declare global {
	interface Window {
		Alpine: typeof Alpine;
	}

	declare module '*.mdx' {
		const content: string;
		export default content;
	}
}
