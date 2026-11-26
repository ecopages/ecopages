import { definePost } from '@ecopages/core';
import { z } from 'zod';
import { handleAgentToolCall } from '@/lib/agents/agent-tools-endpoint.server';
import { getCommerce } from '@/lib/commerce/provider.server';

export const POST = definePost({
	schema: { params: z.object({ name: z.string() }) },
	handler: async ({ request, params }) => handleAgentToolCall(request, params.name, getCommerce()),
});
