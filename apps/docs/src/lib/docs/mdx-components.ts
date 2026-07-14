import { ApiField } from '@/components/api-field/api-field';
import { Banner, BannerTitle } from '@/components/banner/banner';
import { CodeTabs } from '@/components/code-tabs';
import { EcoImage } from '@ecopages/image-processor/component/html';
import type { MDXComponents } from 'mdx/types.js';

/** MDX components available to every docs content module. */
export const docsMdxComponents = {
	Banner,
	BannerTitle,
	ApiField,
	CodeTabs,
	EcoImage,
} satisfies MDXComponents;
