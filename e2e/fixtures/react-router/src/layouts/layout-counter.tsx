import { useState } from 'react';

/** Holds React state inside a layout, so a test can tell a persisted layout from a remounted one. */
export function LayoutCounter({ testId }: { testId: string }) {
	const [count, setCount] = useState(0);
	return (
		<button type="button" data-testid={testId} onClick={() => setCount((value) => value + 1)}>
			{count}
		</button>
	);
}
