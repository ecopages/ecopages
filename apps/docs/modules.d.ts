import '@ecopages/core/declarations';
import '@ecopages/core/env';
import '@ecopages/image-processor/types';

declare module '*.mdx' {
	const content: string;
	export default content;
}
