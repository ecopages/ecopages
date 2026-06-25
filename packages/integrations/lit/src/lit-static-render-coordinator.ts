import type { LitStaticRenderSession } from './lit-static-render-session.ts';

let activeSession: LitStaticRenderSession | null = null;

export function setActiveLitStaticRenderSession(session: LitStaticRenderSession | null): void {
	activeSession = session;
}

export function getActiveLitStaticRenderSession(): LitStaticRenderSession | null {
	return activeSession;
}
