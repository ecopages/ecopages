import type { PageParams, PageQuery } from '@ecopages/core';
import type { RouteRenderResult } from '@ecopages/core/integration';

/** A rendered page, its resolved metadata, and what the main thread needs to cache it. */
export type LitStaticRenderResult = Pick<RouteRenderResult, 'cacheStrategy' | 'sourceDependencyPaths' | 'metadata'> & {
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
	/** Worker-side error name, kept as the rebuilt error's cause. */
	name?: string;
	/** Worker-side stack, kept as the rebuilt error's cause. */
	stack?: string;
	/** Present when the thrown error was an `HttpError`, so the main thread can rebuild one with the same status. */
	status?: number;
};

export type LitStaticRenderWorkerShutdownCompleteMessage = {
	type: 'shutdown-complete';
};

export type LitStaticRenderWorkerResponseMessage =
	| LitStaticRenderWorkerReadyMessage
	| LitStaticRenderWorkerResultMessage
	| LitStaticRenderWorkerErrorMessage
	| LitStaticRenderWorkerShutdownCompleteMessage;
