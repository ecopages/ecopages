declare module '*.mdx' {
	import type { EcoComponent, EcoComponentConfig, EcoPagesElement, GetMetadata } from '@ecopages/core';

	const MDXComponent: EcoComponent<Record<string, unknown>>;
	export const config: EcoComponentConfig | undefined;
	export const getMetadata: GetMetadata | undefined;
	export default MDXComponent;
}
