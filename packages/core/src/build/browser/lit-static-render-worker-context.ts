/** Returns whether the current thread is the Lit static-render worker. */
export function isLitStaticRenderWorkerThread(): boolean {
	return process.env.ECOPAGES_LIT_STATIC_RENDER_WORKER === 'true';
}
