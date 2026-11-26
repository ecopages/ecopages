import { defineGet } from '@ecopages/core';
import { handleAgentToolList } from '@/lib/agents/agent-tools-endpoint.server';

export const GET = defineGet({
	handler: async () => handleAgentToolList(),
});
