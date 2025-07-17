import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';

type ClientOnlyProps = {
	children: ReactNode;
	fallback?: ReactNode;
};

export const useIsClient = () => {
	const [isClient, setIsClient] = useState(false);

	useEffect(() => {
		setIsClient(true);
	}, []);

	return isClient;
};

export const ClientOnly = ({ children, fallback = null }: ClientOnlyProps) => {
	const isClient = useIsClient();

	if (!isClient) {
		return fallback;
	}

	return children;
};
