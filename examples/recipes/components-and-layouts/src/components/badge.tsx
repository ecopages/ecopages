import type { JsxRenderable } from '@ecopages/jsx';
import './badge.css';

/** Static markup with a stylesheet: a plain function is enough. */
export function Badge({ children }: { children?: JsxRenderable }) {
	return <span class="badge">{children}</span>;
}
