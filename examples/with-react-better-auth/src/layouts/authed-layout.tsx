import type { ReactNode } from 'react';
import { eco, type RequestLocals } from '@ecopages/core';
import { BaseLayout } from '@/layouts/base-layout';

type AuthedLayoutProps = {
	children: ReactNode;
	locals?: RequestLocals;
};

export const AuthedLayout = eco.component<AuthedLayoutProps, ReactNode>({
	dependencies: {
		components: [BaseLayout],
	},
	render: ({ children, locals }) => {
		return <BaseLayout session={locals?.session ?? null}>{children}</BaseLayout>;
	},
});
