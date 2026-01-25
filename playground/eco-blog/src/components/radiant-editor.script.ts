import { RadiantElement } from '@ecopages/radiant/core/radiant-element';
import { customElement } from '@ecopages/radiant/decorators/custom-element';
import { query } from '@ecopages/radiant/decorators/query';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from 'tiptap-markdown';

export type RadiantEditorProps = {
	content?: string;
};

@customElement('radiant-editor')
export class RadiantEditor extends RadiantElement {
	@query({ ref: 'editor' }) editorContainer!: HTMLElement;
	@query({ ref: 'content-input' }) contentInput!: HTMLInputElement;

	private editor!: Editor;

	override connectedCallback() {
		super.connectedCallback();
		this.initEditor();
	}

	initEditor() {
		this.editor = new Editor({
			element: this.editorContainer,
			extensions: [StarterKit, Markdown],
			content: this.contentInput.value || '',
			onUpdate: ({ editor }) => {
				const markdown = (editor.storage as any).markdown.getMarkdown();
				this.contentInput.value = markdown;
				this.dispatchEvent(
					new CustomEvent('editor-change', {
						detail: { markdown },
						bubbles: true,
						composed: true,
					}),
				);
			},
		});
	}

	override disconnectedCallback() {
		super.disconnectedCallback();
		this.editor.destroy();
	}
}

declare global {
	namespace JSX {
		interface IntrinsicElements {
			'radiant-editor': HtmlTag & RadiantEditorProps;
		}
	}
}
