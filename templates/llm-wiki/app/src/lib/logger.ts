import { Logger } from '@ecopages/logger';

export const logger = new Logger('[llm-wiki]', {
	debug: process.env.LLM_WIKI_DEBUG === 'true',
});
