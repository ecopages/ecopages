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
};

export type LitStaticRenderWorkerShutdownMessage = {
	type: 'shutdown';
};

export type LitStaticRenderWorkerRequestMessage =
	| LitStaticRenderWorkerInitMessage
	| LitStaticRenderWorkerRenderMessage
	| LitStaticRenderWorkerShutdownMessage;

export type LitStaticRenderWorkerReadyMessage = {
	type: 'ready';
};

export type LitStaticRenderWorkerResultMessage = {
	type: 'result';
	id: string;
	html: string;
};

export type LitStaticRenderWorkerErrorMessage = {
	type: 'error';
	id?: string;
	message: string;
};

export type LitStaticRenderWorkerResponseMessage =
	| LitStaticRenderWorkerReadyMessage
	| LitStaticRenderWorkerResultMessage
	| LitStaticRenderWorkerErrorMessage;
