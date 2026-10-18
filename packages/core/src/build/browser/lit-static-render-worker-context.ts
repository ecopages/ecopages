/** Returns whether the current thread is the Lit static-render worker. */
import { isEcopagesEnvEnabled } from '../../env.ts';

export function isLitStaticRenderWorkerThread(): boolean {
	return isEcopagesEnvEnabled('ECOPAGES_LIT_STATIC_RENDER_WORKER');
}
