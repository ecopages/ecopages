let nextControlId = 0;

export type RadiantOption = {
	id: string;
	label: string;
	description?: string;
};

export type RadiantSelectOption = {
	id: string;
	label: string;
};

export type RadiantValueChangeEvent = {
	value: string;
};

export type RadiantNumberChangeEvent = {
	value: number;
};

export const createControlInstanceId = (prefix: string): string => {
	nextControlId += 1;
	return `${prefix}-${nextControlId}`;
};