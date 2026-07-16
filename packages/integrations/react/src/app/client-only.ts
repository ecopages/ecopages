import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';

type ClientOnlyProps = {
	children: ReactNode;
	fallback?: ReactNode;
};

export const useIsClient = (): boolean => {
	const [isClient, setIsClient] = useState(false);

	useEffect(() => {
		setIsClient(true);
	}, []);

	return isClient;
};

export const ClientOnly = ({ children, fallback = null }: ClientOnlyProps): ReactNode => {
	const isClient = useIsClient();

	if (!isClient) {
		return fallback;
	}

	return children;
};
