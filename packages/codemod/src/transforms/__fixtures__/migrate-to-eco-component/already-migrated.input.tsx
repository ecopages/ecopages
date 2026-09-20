import { eco } from '@ecopages/core';

export const Counter = eco.component<{ count: number }>({
	render: ({ count }) => <span>{count}</span>,
});
