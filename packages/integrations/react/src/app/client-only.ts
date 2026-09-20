import type { ReactNode } from 'react';
import { useSyncExternalStore } from 'react';

type ClientOnlyProps = {
	children: ReactNode;
	fallback?: ReactNode;
};

const emptySubscribe = () => () => {};

export const useIsClient = (): boolean =>
	useSyncExternalStore(
		emptySubscribe,
		() => true,
		() => false,
	);

export const ClientOnly = ({ children, fallback = null }: ClientOnlyProps): ReactNode => {
	const isClient = useIsClient();

	if (!isClient) {
		return fallback;
	}

	return children;
};
