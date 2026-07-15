import type { PageQuery, RouteRenderResult } from '@ecopages/core';

export type LitStaticRenderCacheStrategy = RouteRenderResult['cacheStrategy'];

export type LitStaticRenderWorkerInitMessage = {
	type: 'init';
	configModulePath: string;
	runtimeOrigin: string;
};

export type LitStaticRenderWorkerRenderMessage = {
	type: 'render';
	id: string;
	filePath: string;
	params: Record<string, string>;
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
	html: string;
	cacheStrategy?: LitStaticRenderCacheStrategy;
};

export type LitStaticRenderWorkerErrorMessage = {
	type: 'error';
	id?: string;
	message: string;
};

export type LitStaticRenderWorkerResponseMessage =
	LitStaticRenderWorkerReadyMessage | LitStaticRenderWorkerResultMessage | LitStaticRenderWorkerErrorMessage;
