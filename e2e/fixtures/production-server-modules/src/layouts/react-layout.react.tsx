/** @jsxImportSource react */
import { eco } from '@ecopages/core';
import type { ReactNode } from 'react';

export const ReactLayout = eco.layout<{ children?: ReactNode }>({
	render: ({ children }) => <div data-layout="react">{children}</div>,
});
