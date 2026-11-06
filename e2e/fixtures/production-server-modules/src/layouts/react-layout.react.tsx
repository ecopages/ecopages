/** @jsxImportSource react */
import type { LayoutProps } from '@ecopages/core';
import type { ReactNode } from 'react';

export function ReactLayout({ children }: LayoutProps<ReactNode>) {
	return <div data-layout="react">{children}</div>;
}
