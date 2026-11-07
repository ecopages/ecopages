/// <reference types="@ecopages/core/declarations" />
import { LitElement, html, unsafeCSS } from 'lit';
import styles from './ssr-styled.css';

/**
 * Registers an `ssr: true` element whose styles come from a stylesheet imported as text.
 */
class SsrStyled extends LitElement {
	static override styles = unsafeCSS(styles);

	override render() {
		return html`<span data-ssr-styled>styled</span>`;
	}
}

customElements.define('lit-ssr-styled', SsrStyled);
