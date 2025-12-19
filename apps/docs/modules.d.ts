/// <reference types="@ecopages/core/declarations" />
/// <reference types="@ecopages/core/env" />
/// <reference types="@ecopages/image-processor/types" />

declare module '*.mdx' {
	const content: string;
	export default content;
}
