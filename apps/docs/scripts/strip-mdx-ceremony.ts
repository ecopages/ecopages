function skipBalancedBlock(lines: string[], start: number): number {
	let index = start;
	let depth = 0;
	let started = false;

	while (index < lines.length) {
		const line = lines[index]!;

		for (const char of line) {
			if (char === '{' || char === '(') {
				depth++;
				started = true;
			}
			if (char === '}' || char === ')') {
				depth--;
			}
		}

		index++;

		if (started && depth <= 0 && /[;}]\s*$/.test(line.trim())) {
			break;
		}
	}

	return index;
}

/**
 * Removes page-module ceremony from docs MDX while preserving body content and JSX.
 */
export function stripMdxCeremony(source: string): string {
	const lines = source.split('\n');
	let index = 0;

	while (index < lines.length && /^\s*import\s/.test(lines[index]!)) {
		index++;
	}

	while (index < lines.length && lines[index]!.trim() === '') {
		index++;
	}

	if (index < lines.length && /^\s*export\s+const\s+config\s*=/.test(lines[index]!)) {
		index = skipBalancedBlock(lines, index);
	}

	while (index < lines.length && lines[index]!.trim() === '') {
		index++;
	}

	if (index < lines.length && /^\s*export\s+const\s+getMetadata\s*=/.test(lines[index]!)) {
		index = skipBalancedBlock(lines, index);
	}

	while (index < lines.length && lines[index]!.trim() === '') {
		index++;
	}

	return lines.slice(index).join('\n').replace(/^\n+/, '');
}
