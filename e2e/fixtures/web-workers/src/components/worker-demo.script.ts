import { formatReply } from './format-reply.ts';

const output = document.querySelector<HTMLElement>('[data-worker-reply]');
const worker = new Worker(new URL('./echo.worker.ts', import.meta.url), { type: 'module' });

worker.addEventListener('message', (event: MessageEvent<string>) => {
	if (output) output.textContent = event.data;
});
worker.addEventListener('error', (event) => {
	if (output) output.textContent = formatReply(`worker error ${event.message}`);
});
worker.postMessage('ping');
