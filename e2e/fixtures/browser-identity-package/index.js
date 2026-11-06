import { createElement, useState } from 'react';
import { context } from './shared.js';
export function Provider({ children }) {
	const [count, setCount] = useState(0);
	return createElement(context.Provider, { value: { count, increment: () => setCount(count + 1) } }, children);
}
