export type CssTransformInput = {
	contents: string | Buffer;
	filePath: string;
};

export type CssTransform = (input: CssTransformInput) => Promise<string>;

export type CssRuntimeProcessor = (contents: string, filePath: string) => Promise<string>;

export type NodeCssProcessor = CssRuntimeProcessor;
