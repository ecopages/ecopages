import { eco } from '@ecopages/core';
import type { EcoPagesElement } from '@ecopages/core';

export const KitaLayout = eco.layout<{ children: EcoPagesElement }>({
	render: ({ children }) => <div data-layout="kita">{children as 'safe'}</div>,
});
