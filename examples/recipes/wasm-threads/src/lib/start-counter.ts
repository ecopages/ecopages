import type { CounterRequest } from './counter.worker';

const output = document.querySelector<HTMLElement>('[data-result]');

function show(text: string): void {
	if (output) output.textContent = text;
}

if (!self.crossOriginIsolated) {
	show('not isolated');
} else {
	const memory = new WebAssembly.Memory({ initial: 1, maximum: 1, shared: true });
	const worker = new Worker(new URL('./counter.worker.ts', import.meta.url), { type: 'module' });

	worker.addEventListener('message', () => {
		show(`isolated, counter ${Atomics.load(new Int32Array(memory.buffer), 0)}`);
	});
	worker.addEventListener('error', (event) => show(`worker error ${event.message}`));
	worker.postMessage({ memory, increments: 1000 } satisfies CounterRequest);
}
