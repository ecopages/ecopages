import { eco } from '@ecopages/core';
import { Provider } from '@ecopages/e2e-browser-identity';
import { useCounter } from '@ecopages/e2e-browser-identity/hooks';

function Counter() {
	const { count, increment } = useCounter();
	return (
		<button data-testid="identity-counter" onClick={increment}>
			{count}
		</button>
	);
}

export default eco.page({
	render: () => (
		<Provider>
			<Counter />
		</Provider>
	),
});
