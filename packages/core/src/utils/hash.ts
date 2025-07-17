export const rapidhash = (content: string | Buffer<ArrayBufferLike>): number | bigint => {
	return Bun.hash(content);
};
