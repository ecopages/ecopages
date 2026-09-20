import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import type { CopyForLlmProps } from './copy-for-llm.script';
import { copyForLlmCheckIcon, copyForLlmSparkleIcon } from './copy-for-llm-icons';
import './copy-for-llm.css';

export type { CopyForLlmProps };

export const CopyForLlm = eco.component<CopyForLlmProps, JsxRenderable>({
	dependencies: {
		scripts: [{ src: './copy-for-llm.script.tsx', ssr: true }],
		stylesheets: ['./copy-for-llm.css'],
	},
	render: ({ path, label = 'Copy for LLM' }: CopyForLlmProps) => {
		return (
			<button
				type="button"
				class="rui-button rui-button--outline rui-button--sm docs-copy-for-llm"
				data-copy-for-llm
				data-markdown-url={path}
				data-copied="false"
				data-copy-error="false"
				aria-label={label}
			>
				<span class="docs-copy-for-llm__icon docs-copy-for-llm__icon--sparkle" aria-hidden="true">
					{copyForLlmSparkleIcon}
				</span>
				<span class="docs-copy-for-llm__icon docs-copy-for-llm__icon--check" aria-hidden="true">
					{copyForLlmCheckIcon}
				</span>
				<span class="docs-copy-for-llm__label">{label}</span>
			</button>
		);
	},
});
