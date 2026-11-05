import '@ecopages/core/declarations';
import '@ecopages/core/env';
import '@ecopages/react/declarations';

declare module '@ecopages/e2e-browser-identity' {
	import type { ReactNode } from 'react';
	export function Provider(props: { children: ReactNode }): ReactNode;
}
declare module '@ecopages/e2e-browser-identity/hooks' {
	export function useCounter(): { count: number; increment: () => void };
}
