import type { EcoPagesAppConfig } from './internal-types';

declare global {
	var ecoConfig: EcoPagesAppConfig;
}

declare module '*.css' {
	const styles: string;
	export default styles;
}

declare module '*.mdx' {
	let MDXComponent: (props: any) => JSX.Element;
	export default MDXComponent;
}
