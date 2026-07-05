import type { JsxRenderable } from '@ecopages/jsx';
import { getDocsKit } from '../../config';

/** Returns the configured icon for a docs section, if any. */
export function getSectionIcon(sectionId: string): JsxRenderable {
	const icon = getDocsKit().sectionIcons[sectionId];
	return (icon ?? null) as JsxRenderable;
}
