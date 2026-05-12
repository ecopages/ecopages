const FIELD_ID_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

const createNanoId = (size: number = 8): string => {
	let id = '';

	for (let index = 0; index < size; index += 1) {
		id += FIELD_ID_ALPHABET[Math.floor(Math.random() * FIELD_ID_ALPHABET.length)];
	}

	return id;
};

export type RadiantFieldProps = {
	id?: string;
	label?: string;
	description?: string;
	ariaLabel?: string;
	class?: string;
};

export type RadiantOption = {
	id: string;
	label: string;
	description?: string;
};

export type RadiantSelectOption = {
	id: string;
	label: string;
	disabled?: boolean;
};

export type RadiantValueChangeEvent = {
	value: string;
};

export type RadiantNumberChangeEvent = {
	value: number;
};

export const ensureFieldId = (element: HTMLElement, prefix: string): string => {
	if (!element.id) {
		element.id = `${prefix}-${createNanoId()}`;
	}

	return element.id;
};

export const createFieldIds = (baseId: string) => {
	return {
		controlId: `${baseId}-control`,
		labelId: `${baseId}-label`,
		descriptionId: `${baseId}-description`,
	};
};