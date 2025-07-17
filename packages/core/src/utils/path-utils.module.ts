import path from 'node:path';

function getEcoTemplateExtension(filePath: string) {
	const { name, ext } = path.parse(filePath);
	const nameParts = name.split('.');
	const descriptor = nameParts.length > 1 ? nameParts.pop() : undefined;
	const templateExtension = descriptor ? `.${descriptor}${ext}` : ext;

	return templateExtension;
}

export const PathUtils = {
	getEcoTemplateExtension,
};
