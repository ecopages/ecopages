import type { EcoPagesElement, LayoutProps } from '@ecopages/core';

export function KitaLayout({ children }: LayoutProps<EcoPagesElement>) {
	return <div data-layout="kita">{children as 'safe'}</div>;
}
