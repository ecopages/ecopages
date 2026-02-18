import { runtimeHash } from './runtime.ts';

export const rapidhash = (content: string | Buffer<ArrayBufferLike>): number | bigint => {
	return runtimeHash(content);
};
