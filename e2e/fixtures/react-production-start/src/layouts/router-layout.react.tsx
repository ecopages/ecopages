/** @jsxImportSource react */
import type { LayoutProps } from '@ecopages/core';
import { useState } from 'react';

export function RouterLayout({ children }: LayoutProps) {
	const [count, setCount] = useState(0);
	return (
		<div>
			<nav>
				<a href="/router/first" data-link-first>
					first
				</a>
				<a href="/router/second" data-link-second>
					second
				</a>
			</nav>
			<button type="button" data-layout-counter onClick={() => setCount((value) => value + 1)}>
				layout {count}
			</button>
			{children}
		</div>
	);
}
