function decodeJavaScriptString(value: string): string {
	return value
		.replace(/\\n/g, '\n')
		.replace(/\\r/g, '\r')
		.replace(/\\t/g, '\t')
		.replace(/\\([\\'"`])/g, '$1');
}

function transformMarkdownSegments(source: string, transform: (segment: string) => string): string {
	return source
		.split(/(```[\s\S]*?```)/g)
		.map((segment, index) => (index % 2 === 1 ? segment : transform(segment)))
		.join('');
}

function readAttribute(attributes: string, name: string): string | undefined {
	const match = new RegExp(
		`${name}=(?:"([^"]*)"|'([^']*)'|\\{` + '`' + `([\\s\\S]*?)` + '`' + `\\}|\\{([^}]*)\\})`,
	).exec(attributes);
	return match ? decodeJavaScriptString(match[1] ?? match[2] ?? match[3] ?? match[4] ?? '') : undefined;
}

function replaceAlerts(source: string): string {
	return source.replace(/<RuiAlert\b[^>]*>([\s\S]*?)<\/RuiAlert>/g, (_, body: string) => {
		const title = /<RuiAlertTitle>([\s\S]*?)<\/RuiAlertTitle>/.exec(body)?.[1] ?? 'Note';
		const description = /<RuiAlertDescription>([\s\S]*?)<\/RuiAlertDescription>/.exec(body)?.[1] ?? body;
		const content = description
			.replace(/<a\s+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/g, (_, url: string, label: string) => {
				return `[${label.replace(/\s+/g, ' ').trim()}](${url})`;
			})
			.replace(/<[^>]+>/g, '')
			.replace(/^[ \t]+/gm, '')
			.trim();
		return [
			`> **${title.replace(/<[^>]+>/g, '').trim()}:**`,
			...content
				.split('\n')
				.filter(Boolean)
				.map((line) => `> ${line}`),
		].join('\n');
	});
}

/**
 * Converts docs MDX into Markdown for the template's agent-facing exports.
 *
 * @remarks
 * Fenced examples remain unchanged. UI-only alerts, links, images, imports, and JSX wrappers are converted or removed
 * from prose so the generated files can be read without the docs site's component runtime.
 */
export function toLlmMarkdown(source: string): string {
	const withAlerts = replaceAlerts(source);
	const withoutImports = transformMarkdownSegments(withAlerts, (segment) =>
		segment.replace(/^import\s+[^\n]+\n?/gm, ''),
	);
	const markdown = transformMarkdownSegments(withoutImports, (segment) =>
		segment
			.replace(/<a\s+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/g, (_, url: string, label: string) => {
				return `[${label.replace(/\s+/g, ' ').trim()}](${url})`;
			})
			.replace(/<img\b([^>]*)>/gi, (_, attributes: string) => {
				const src = readAttribute(attributes, 'src');
				const alt = readAttribute(attributes, 'alt') ?? 'Image';
				return src ? `![${alt}](${src})` : `_${alt}_`;
			})
			.replace(/<\/?[A-Z][\w.-]*(?:\s[^>]*)?\/?>/g, '')
			.replace(
				/<\/?(?:div|p|ul|ol|li|figure|figcaption|span|br|table|thead|tbody|tr|td|th|strong|em|code|pre)(?:\s[^>]*)?\/?>/gi,
				'',
			),
	);

	return markdown
		.replace(/\n{3,}/g, '\n\n')
		.trimEnd()
		.concat('\n');
}
