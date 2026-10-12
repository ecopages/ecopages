import type { PageParams, PageQuery, RouteRenderResult } from '@ecopages/core';

/** A rendered page and the metadata the main thread needs to cache it. */
export type LitStaticRenderResult = Pick<RouteRenderResult, 'cacheStrategy' | 'sourceDependencyPaths'> & {
	html: string;
};

export type LitStaticRenderWorkerInitMessage = {
	type: 'init';
	configModulePath: string;
	runtimeOrigin: string;
};

export type LitStaticRenderWorkerRenderMessage = {
	type: 'render';
	id: string;
	filePath: string;
	/** Route params; multi-value keys stay as `string[]`. */
	params: PageParams;
	/** Serializable route query; preserves multi-value keys as `string[]`. */
	query?: PageQuery;
};

export type LitStaticRenderWorkerShutdownMessage = {
	type: 'shutdown';
};

export type LitStaticRenderWorkerRequestMessage =
	LitStaticRenderWorkerInitMessage | LitStaticRenderWorkerRenderMessage | LitStaticRenderWorkerShutdownMessage;

export type LitStaticRenderWorkerReadyMessage = {
	type: 'ready';
};

export type LitStaticRenderWorkerResultMessage = {
	type: 'result';
	id: string;
} & LitStaticRenderResult;

export type LitStaticRenderWorkerErrorMessage = {
	type: 'error';
	id?: string;
	message: string;
};

export type LitStaticRenderWorkerResponseMessage =
	LitStaticRenderWorkerReadyMessage | LitStaticRenderWorkerResultMessage | LitStaticRenderWorkerErrorMessage;
