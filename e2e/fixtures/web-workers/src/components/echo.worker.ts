import { formatReply } from './format-reply.ts';

self.addEventListener('message', (event: MessageEvent<string>) => {
	self.postMessage(formatReply(`${event.data} from worker`));
});
