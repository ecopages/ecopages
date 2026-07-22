import { DEV_MANIFEST_ELEMENT_ID, type EcoDevManifest } from './manifest-contract.ts';

/**
 * Parses `#__ECO_DEV_MANIFEST__` from the active document.
 *
 * @returns Parsed manifest, or `undefined` when the element is missing or invalid JSON.
 */
export function readDevManifestFromDocument(doc: Document = document): EcoDevManifest | undefined {
	const element = doc.getElementById(DEV_MANIFEST_ELEMENT_ID);
	if (!element?.textContent) {
		return undefined;
	}

	try {
		return JSON.parse(element.textContent) as EcoDevManifest;
	} catch {
		return undefined;
	}
}

/**
 * Writes or replaces `#__ECO_DEV_MANIFEST__` in the active document.
 *
 * @remarks Used after client navigations so toolbar panels can read the latest route payload.
 */
export function updateDevManifestInDocument(manifest: EcoDevManifest, doc: Document = document): void {
	let element = doc.getElementById(DEV_MANIFEST_ELEMENT_ID);
	if (!element) {
		const script = doc.createElement('script');
		script.id = DEV_MANIFEST_ELEMENT_ID;
		script.setAttribute('type', 'application/json');
		element = script;
		doc.body.append(element);
	}

	element.textContent = JSON.stringify(manifest);
}
