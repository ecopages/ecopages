import type { MDXComponents } from 'mdx/types.js';
import type { JsxRenderable } from '@ecopages/jsx';

export type DocsMdxComponentProps = {
	components?: MDXComponents;
};

export type DocsMdxComponent = (props?: DocsMdxComponentProps) => JsxRenderable | Promise<JsxRenderable>;

export type CompiledDocsMdx = {
	default: DocsMdxComponent;
};
