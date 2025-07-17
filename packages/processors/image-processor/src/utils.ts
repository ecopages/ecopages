export function anyCaseToCamelCase(str: string): string {
	if (!str) return '';

	let result = '';
	let capitalize = false;

	for (let i = 0; i < str.length; i++) {
		const char = str[i];

		if (/[0-9]/.test(char)) {
			result += char;
			capitalize = true;
			continue;
		}

		if (/[a-zA-Z]/.test(char)) {
			if (capitalize) {
				result += char.toUpperCase();
				capitalize = false;
			} else {
				result += char.toLowerCase();
			}
			continue;
		}

		capitalize = true;
	}

	return result;
}
