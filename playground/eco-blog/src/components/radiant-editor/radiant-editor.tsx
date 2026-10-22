import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import './radiant-editor.css';

type RadiantEditorViewProps = {
	name: string;
	content?: string;
	labelledBy: string;
};

/** Markdown editor host: the toolbar and ProseMirror surface come from `radiant-editor.script.ts`. */
export const RadiantEditor = eco.component<RadiantEditorViewProps, JsxRenderable>({
	dependencies: {
		scripts: ['./radiant-editor.script.ts'],
	},
	render: ({ name, content, labelledBy }) => (
		<radiant-editor class="rich-editor">
			<div class="rich-editor__toolbar" role="toolbar" aria-label="Formatting" data-ref="toolbar"></div>
			<div class="rich-editor__surface" data-ref="editor" aria-labelledby={labelledBy}></div>
			<input type="hidden" data-ref="content-input" name={name} value={content ?? ''} />
			<p class="rich-editor__status" role="status" data-ref="status"></p>
		</radiant-editor>
	),
});
