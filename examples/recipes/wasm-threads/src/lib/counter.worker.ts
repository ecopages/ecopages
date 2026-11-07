export type CounterRequest = { memory: WebAssembly.Memory; increments: number };

addEventListener('message', (event: MessageEvent<CounterRequest>) => {
	const counter = new Int32Array(event.data.memory.buffer);
	for (let index = 0; index < event.data.increments; index += 1) {
		Atomics.add(counter, 0, 1);
	}
	postMessage('done');
});
