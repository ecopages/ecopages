export type CssTransformInput = {
	contents: string | Buffer;
	filePath: string;
};

export type CssTransform = (input: CssTransformInput) => string | Promise<string>;
