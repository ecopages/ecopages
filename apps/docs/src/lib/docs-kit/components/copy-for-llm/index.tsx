import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import type { CopyForLlmProps } from './copy-for-llm.script';
import './copy-for-llm.script';
import { copyForLlmCheckIcon, copyForLlmSparkleIcon } from './copy-for-llm-icons';

export type { CopyForLlmProps };

export const CopyForLlm = eco.component<CopyForLlmProps, JsxRenderable>({
	dependencies: {
		scripts: ['./copy-for-llm.script.tsx'],
		stylesheets: ['./copy-for-llm.css'],
	},
	render: ({ llmUrl, label = 'Copy for LLM' }: CopyForLlmProps) => {
		return (
			<radiant-copy-for-llm llm-url={llmUrl}>
				<button type="button" class="docs-copy-for-llm" aria-label={label} data-testid="copy-for-llm">
					<span class="docs-copy-for-llm__icon docs-copy-for-llm__icon--sparkle" aria-hidden="true">
						{copyForLlmSparkleIcon}
					</span>
					<span class="docs-copy-for-llm__icon docs-copy-for-llm__icon--check" aria-hidden="true">
						{copyForLlmCheckIcon}
					</span>
					<span class="docs-copy-for-llm__label">{label}</span>
				</button>
			</radiant-copy-for-llm>
		);
	},
});
