/// <reference path="../../node_modules/@ecopages/core/src/declarations.d.ts" />
/// <reference path="../../node_modules/@ecopages/core/src/env.d.ts" />

declare module '*.mdx' {
	const content: string;
	export default content;
}
