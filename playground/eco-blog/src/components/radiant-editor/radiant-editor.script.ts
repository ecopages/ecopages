import { RadiantElement } from '@ecopages/radiant/core/radiant-element';
import { customElement } from '@ecopages/radiant/decorators/custom-element';
import { query } from '@ecopages/radiant/decorators/query';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Markdown, type MarkdownStorage } from 'tiptap-markdown';
import type { JsxCustomElementAttributes } from '@ecopages/jsx';
import Image from '@tiptap/extension-image';

export type RadiantEditorProps = {
	content?: string;
};

@customElement('radiant-editor')
export class RadiantEditor extends RadiantElement {
	@query({ ref: 'editor' }) editorContainer!: HTMLElement;
	@query({ ref: 'toolbar' }) toolbarContainer!: HTMLElement;
	@query({ ref: 'content-input' }) contentInput!: HTMLInputElement;
	@query({ ref: 'status' }) statusRegion!: HTMLElement;

	private editor!: Editor;

	override connectedCallback() {
		super.connectedCallback();
		this.initEditor();
	}

	initEditor() {
		this.editor = new Editor({
			element: this.editorContainer,
			extensions: [StarterKit, Markdown, Image],
			editorProps: {
				attributes: {
					role: 'textbox',
					'aria-multiline': 'true',
					'aria-labelledby': this.editorContainer.getAttribute('aria-labelledby') ?? '',
				},
			},
			content: this.contentInput.value || '',
			onUpdate: ({ editor }) => {
				const markdown = (editor.storage as unknown as { markdown: MarkdownStorage }).markdown.getMarkdown();
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

		this.setupToolbar();
	}

	setupToolbar() {
		const tools: { label: string; text: string; run: () => void; active: () => boolean }[] = [
			{
				label: 'Bold',
				text: 'B',
				run: () => this.editor.chain().focus().toggleBold().run(),
				active: () => this.editor.isActive('bold'),
			},
			{
				label: 'Italic',
				text: 'I',
				run: () => this.editor.chain().focus().toggleItalic().run(),
				active: () => this.editor.isActive('italic'),
			},
			{
				label: 'Strikethrough',
				text: 'S',
				run: () => this.editor.chain().focus().toggleStrike().run(),
				active: () => this.editor.isActive('strike'),
			},
			{
				label: 'Heading',
				text: 'H2',
				run: () => this.editor.chain().focus().toggleHeading({ level: 2 }).run(),
				active: () => this.editor.isActive('heading', { level: 2 }),
			},
			{
				label: 'Subheading',
				text: 'H3',
				run: () => this.editor.chain().focus().toggleHeading({ level: 3 }).run(),
				active: () => this.editor.isActive('heading', { level: 3 }),
			},
			{
				label: 'Bulleted list',
				text: 'List',
				run: () => this.editor.chain().focus().toggleBulletList().run(),
				active: () => this.editor.isActive('bulletList'),
			},
			{
				label: 'Quote',
				text: 'Quote',
				run: () => this.editor.chain().focus().toggleBlockquote().run(),
				active: () => this.editor.isActive('blockquote'),
			},
			{ label: 'Insert image', text: 'Image', run: () => this.addImage(), active: () => false },
		];

		const buttons = tools.map((tool) => {
			const button = document.createElement('button');
			button.type = 'button';
			button.className = 'rui-button rui-button--ghost rui-button--sm';
			button.textContent = tool.text;
			button.setAttribute('aria-label', tool.label);
			button.addEventListener('click', () => {
				tool.run();
				sync();
			});
			this.toolbarContainer.append(button);
			return button;
		});

		const sync = () => {
			tools.forEach((tool, index) => buttons[index].setAttribute('aria-pressed', String(tool.active())));
		};

		this.editor.on('selectionUpdate', sync);
		this.editor.on('transaction', sync);
		sync();
	}

	async addImage() {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = 'image/*';
		input.onchange = async (e) => {
			const file = (e.target as HTMLInputElement).files?.[0];
			if (file) {
				const formData = new FormData();
				formData.append('file', file);
				try {
					const response = await fetch('/api/upload', {
						method: 'POST',
						body: formData,
					});
					if (response.ok) {
						const { url } = await response.json();
						this.editor.chain().focus().setImage({ src: url }).run();
					} else {
						this.reportUploadError();
					}
				} catch {
					this.reportUploadError();
				}
			}
		};
		input.click();
	}

	private reportUploadError() {
		this.statusRegion.textContent = 'The image could not be uploaded. Try again.';
	}

	override disconnectedCallback() {
		super.disconnectedCallback();
		this.editor.destroy();
	}
}

declare module '@ecopages/jsx' {
	interface JsxCustomIntrinsicElements {
		'radiant-editor': JsxCustomElementAttributes<RadiantEditor, RadiantEditorProps>;
	}
}
