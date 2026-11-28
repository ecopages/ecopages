import { definePost, sameOrigin } from '@ecopages/core';
import { z } from 'zod';
import { handleAgentToolCall } from '@/lib/agents/agent-tools-endpoint.server';
import { getCommerce } from '@/lib/commerce/provider.server';

/**
 * The WebMCP tools of the page. Each tool checks its own input, so the body is only parsed here, within Ecopages'
 * `maxRequestBodySize`, and a missing or empty body reaches the tool as `undefined`.
 */
export const POST = definePost({
	middleware: [sameOrigin()],
	schema: { params: z.object({ name: z.string() }), body: z.unknown() },
	handler: async ({ request, params, body }) => handleAgentToolCall(request, params.name, getCommerce(), body),
});
