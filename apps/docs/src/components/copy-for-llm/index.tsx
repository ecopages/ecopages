import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import type { CopyForLlmProps } from './copy-for-llm.script';
import './copy-for-llm.script';

export type { CopyForLlmProps };

export const CopyForLlm = eco.component<CopyForLlmProps, JsxRenderable>({
	dependencies: {
		scripts: ['./copy-for-llm.script.tsx'],
		stylesheets: ['./copy-for-llm.css'],
	},
	render: ({ llmUrl, label = 'Copy for LLM' }: CopyForLlmProps) => {
		return <radiant-copy-for-llm prop:llmUrl={llmUrl} prop:label={label} />;
	},
});
