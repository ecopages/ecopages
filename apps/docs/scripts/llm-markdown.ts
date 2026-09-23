type LlmCodeTab = {
	label: string;
	code: string;
};

function decodeJavaScriptString(value: string): string {
	return value
		.replace(/\\n/g, '\n')
		.replace(/\\r/g, '\r')
		.replace(/\\t/g, '\t')
		.replace(/\\([\\'"`])/g, '$1');
}

function readCodeTabs(block: string): LlmCodeTab[] {
	const tabs: LlmCodeTab[] = [];
	const tabPattern =
		/label:\s*(?:'((?:\\.|[^'])*)'|"((?:\\.|[^"])*)")[\s\S]*?code:\s*(?:'((?:\\.|[^'])*)'|"((?:\\.|[^"])*)"|`([\s\S]*?)`)/g;

	for (const match of block.matchAll(tabPattern)) {
		const label = decodeJavaScriptString(match[1] ?? match[2] ?? '');
		const code = decodeJavaScriptString(match[3] ?? match[4] ?? match[5] ?? '');
		if (label && code) {
			tabs.push({ label, code });
		}
	}

	return tabs;
}

function replaceCodeTabs(source: string): string {
	return source.replace(/<CodeTabs\b[\s\S]*?\/>/g, (block) => {
		const tabs = readCodeTabs(block);
		if (tabs.length === 0) {
			return block;
		}

		return tabs.map(({ label, code }) => `**${label}**\n\n\`\`\`bash\n${code}\n\`\`\``).join('\n\n');
	});
}

function cleanInlineMdx(source: string): string {
	return source
		.replace(/<a\s+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/g, '[$2]($1)')
		.replace(/<code>([\s\S]*?)<\/code>/g, '`$1`')
		.replace(/\[\s*([\s\S]*?)\s*\]\(([^)]+)\)/g, (_, label: string, url: string) => {
			return `[${label.replace(/\s+/g, ' ').trim()}](${url})`;
		})
		.replace(/<li>\s*/g, '\n- ')
		.replace(/<\/li>/g, '')
		.replace(/<\/?(?:p|ul|ol)>/g, '\n')
		.replace(/\{\s*["'`]\s*["'`]\s*\}/g, '')
		.replace(/<[^>]+>/g, '')
		.replace(/^[ \t]+/gm, '')
		.replace(/[ \t]+\n/g, '\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

function transformMarkdownSegments(source: string, transform: (segment: string) => string): string {
	return source
		.split(/(```[\s\S]*?```)/g)
		.map((segment, index) => (index % 2 === 1 ? segment : transform(segment)))
		.join('');
}

function stripMdxComponents(source: string): string {
	return transformMarkdownSegments(source, (segment) =>
		segment
			.replace(/^import\s+[^\n]+\n?/gm, '')
			.replace(/<a\s+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/g, (_, url: string, label: string) => {
				return `[${label.replace(/\s+/g, ' ').trim()}](${url})`;
			})
			.replace(/<img\b([^>]*)>/gi, (_, attributes: string) => {
				const src = readAttribute(attributes, 'src');
				const alt = readAttribute(attributes, 'alt') ?? 'Image';
				return src ? `![${alt}](${src})` : `_${alt}_`;
			})
			.replace(/<EcoImage\b([\s\S]*?)\/>/g, (_, attributes: string) => {
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
}

function replaceAlerts(source: string): string {
	return source.replace(/<RuiAlert\b[^>]*>([\s\S]*?)<\/RuiAlert>/g, (_, body: string) => {
		const title = /<RuiAlertTitle>([\s\S]*?)<\/RuiAlertTitle>/.exec(body)?.[1];
		const description = /<RuiAlertDescription>([\s\S]*?)<\/RuiAlertDescription>/.exec(body)?.[1] ?? body;
		const content = cleanInlineMdx(description);
		const lines = content.split('\n').filter(Boolean);
		return [`> **${cleanInlineMdx(title ?? 'Note')}:**`, ...lines.map((line) => `> ${line}`)].join('\n');
	});
}

function readAttribute(attributes: string, name: string): string | undefined {
	const match = new RegExp(
		`${name}=(?:"([^"]*)"|'([^']*)'|\\{` + '`' + `([\\s\\S]*?)` + '`' + `\\}|\\{([^}]*)\\})`,
	).exec(attributes);
	return match ? decodeJavaScriptString(match[1] ?? match[2] ?? match[3] ?? match[4] ?? '') : undefined;
}

function replaceApiFields(source: string): string {
	return source.replace(/<ApiField\b([^>]*)>([\s\S]*?)<\/ApiField>/g, (_, attributes: string, body: string) => {
		const name = readAttribute(attributes, 'name') ?? 'Configuration field';
		const type = readAttribute(attributes, 'type');
		const defaultValue = readAttribute(attributes, 'defaultValue');
		const setter = readAttribute(attributes, 'setter');
		const details = [
			type ? `Type: \`${type}\`` : undefined,
			/\bmandatory(?:\s|$)/.test(attributes) ? 'Required' : undefined,
			defaultValue ? `Default: \`${defaultValue}\`` : undefined,
			setter ? `Builder method: \`${setter}()\`` : undefined,
		].filter(Boolean);
		const detailText = details.length > 0 ? `${details.join('. ')}.` : '';
		const content = cleanInlineMdx(body);
		return `### \`${name}\`\n\n${detailText}${content ? `\n\n${content}` : ''}`;
	});
}

function stripTopLevelImports(source: string): string {
	const headingIndex = source.search(/^#\s+/m);
	if (headingIndex < 0) {
		return source;
	}

	const beforeHeading = source.slice(0, headingIndex).replace(/^import\s+[\s\S]*?;\s*$/gm, '');
	return `${beforeHeading}${source.slice(headingIndex)}`;
}

/**
 * Converts docs MDX into Markdown that an agent can read without resolving the docs site's UI components.
 *
 * @remarks
 * Code examples remain fenced. Presentation components such as tabs, alerts, and API-field cards become
 * ordinary Markdown, while the source MDX remains the canonical human-facing document.
 */
export function toLlmMarkdown(source: string): string {
	return stripMdxComponents(stripTopLevelImports(replaceApiFields(replaceAlerts(replaceCodeTabs(source)))))
		.replace(/\n{3,}/g, '\n\n')
		.trimEnd()
		.concat('\n');
}
