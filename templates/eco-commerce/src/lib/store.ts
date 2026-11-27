/** The storefront's name, shown in the header and page titles. Change it here to rebrand the store. */
export const STORE_NAME = 'Fernwood';

export function pageTitle(title?: string): string {
	return title ? `${title} | ${STORE_NAME}` : STORE_NAME;
}
