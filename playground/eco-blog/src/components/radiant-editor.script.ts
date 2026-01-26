import { RadiantElement } from '@ecopages/radiant/core/radiant-element';
import { customElement } from '@ecopages/radiant/decorators/custom-element';
import { query } from '@ecopages/radiant/decorators/query';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from 'tiptap-markdown';
import Image from '@tiptap/extension-image';

export type RadiantEditorProps = {
	content?: string;
};

@customElement('radiant-editor')
export class RadiantEditor extends RadiantElement {
	@query({ ref: 'editor' }) editorContainer!: HTMLElement;
	@query({ ref: 'toolbar' }) toolbarContainer!: HTMLElement;
	@query({ ref: 'content-input' }) contentInput!: HTMLInputElement;

	private editor!: Editor;

	override connectedCallback() {
		super.connectedCallback();
		this.initEditor();
	}

	initEditor() {
		this.editor = new Editor({
			element: this.editorContainer,
			extensions: [StarterKit, Markdown, Image],
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

		this.setupToolbar();
	}

	setupToolbar() {
		const buttons = [
			{
				label: 'B',
				command: () => this.editor.chain().focus().toggleBold().run(),
				isActive: () => this.editor.isActive('bold'),
			},
			{
				label: 'I',
				command: () => this.editor.chain().focus().toggleItalic().run(),
				isActive: () => this.editor.isActive('italic'),
			},
			{
				label: 'S',
				command: () => this.editor.chain().focus().toggleStrike().run(),
				isActive: () => this.editor.isActive('strike'),
			},
			{
				label: 'H1',
				command: () => this.editor.chain().focus().toggleHeading({ level: 1 }).run(),
				isActive: () => this.editor.isActive('heading', { level: 1 }),
			},
			{
				label: 'H2',
				command: () => this.editor.chain().focus().toggleHeading({ level: 2 }).run(),
				isActive: () => this.editor.isActive('heading', { level: 2 }),
			},
			{
				label: 'H3',
				command: () => this.editor.chain().focus().toggleHeading({ level: 3 }).run(),
				isActive: () => this.editor.isActive('heading', { level: 3 }),
			},
			{ label: 'IMG', command: () => this.addImage(), isActive: () => false },
		];

		buttons.forEach((btn) => {
			const button = document.createElement('button');
			button.textContent = btn.label;
			button.type = 'button';
			button.className =
				'px-2 py-1 text-sm font-medium text-slate-700 hover:bg-slate-200 rounded transition-colors';
			button.onclick = (e) => {
				e.preventDefault();
				btn.command();
				this.updateToolbarState();
			};
			this.toolbarContainer.appendChild(button);
		});

		this.editor.on('selectionUpdate', () => this.updateToolbarState());
		this.editor.on('transaction', () => this.updateToolbarState());
	}

	updateToolbarState() {
		const buttons = this.toolbarContainer.querySelectorAll('button');
		buttons.forEach((button) => {
			const label = button.textContent;
			if (label === 'B' && this.editor.isActive('bold')) button.classList.add('bg-slate-200');
			else if (label === 'I' && this.editor.isActive('italic')) button.classList.add('bg-slate-200');
			else if (label === 'S' && this.editor.isActive('strike')) button.classList.add('bg-slate-200');
			else if (label === 'H1' && this.editor.isActive('heading', { level: 1 }))
				button.classList.add('bg-slate-200');
			else if (label === 'H2' && this.editor.isActive('heading', { level: 2 }))
				button.classList.add('bg-slate-200');
			else if (label === 'H3' && this.editor.isActive('heading', { level: 3 }))
				button.classList.add('bg-slate-200');
			else button.classList.remove('bg-slate-200');
		});
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
					const response = await fetch('/admin/upload', {
						method: 'POST',
						body: formData,
					});
					if (response.ok) {
						const { url } = await response.json();
						this.editor.chain().focus().setImage({ src: url }).run();
					} else {
						alert('Failed to upload image');
					}
				} catch (error) {
					console.error('Error uploading image:', error);
					alert('Error uploading image');
				}
			}
		};
		input.click();
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
