export type ShowcasePattern = {
	highlights: string[];
	release: string;
	slug: string;
	stage: 'active' | 'experimental' | 'stable';
	summary: string;
	title: string;
};

export type ReleaseNote = {
	body: string;
	highlights: string[];
	slug: string;
	title: string;
	version: string;
};

export type CrewMember = {
	focus: string;
	name: string;
	track: string;
};

export type Announcement = {
	createdAt: string;
	createdBy: string;
	id: string;
	message: string;
	title: string;
};

export const showcasePatterns: ShowcasePattern[] = [
	{
		slug: 'semantic-html',
		title: 'Semantic html shell discovery',
		summary:
			'The document shell now resolves by basename and integration extension instead of config-driven filenames.',
		highlights: ['eco.html()', 'html.* semantic lookup', 'single document shell per route'],
		stage: 'active',
		release: 'Phase 1 foundation',
	},
	{
		slug: 'route-middleware',
		title: 'Page middleware and request locals',
		summary:
			'Request data is attached once and consumed by both the page and the layout through the same contract.',
		highlights: ['cache: dynamic', 'requires', 'layout locals'],
		stage: 'stable',
		release: 'Runtime flow',
	},
	{
		slug: 'grouped-handlers',
		title: 'Grouped handlers and JSON APIs',
		summary:
			'Explicit API groups reuse middleware, locals, and shared error handling without leaving the app boundary.',
		highlights: ['defineApiHandler()', 'defineGroupHandler()', 'ctx.response.json()'],
		stage: 'experimental',
		release: 'Operations lane',
	},
];

export const releaseNotes: ReleaseNote[] = [
	{
		version: '0.1.0',
		slug: 'phase-1-shells',
		title: 'Semantic shell factories land',
		body: 'Introduced eco.html() and eco.layout() as the public vocabulary for document and route shells while preserving the existing renderer pipeline.',
		highlights: ['eco.html()', 'eco.layout()', 'metadata plugin support'],
	},
	{
		version: '0.1.1',
		slug: 'config-removal',
		title: 'Legacy template config removed',
		body: 'ConfigBuilder now derives html and 404 templates semantically from the filesystem instead of exposing template filename setters.',
		highlights: ['no setIncludesTemplates()', 'no setError404Template()', 'duplicate semantic template guardrails'],
	},
	{
		version: '0.1.2',
		slug: 'kitchen-sink-expansion',
		title: 'Kitchen sink now covers real runtime paths',
		body: 'The playground exercises file routes, explicit routes, middleware locals, grouped handlers, and imperative rendering in the same app.',
		highlights: ['ctx.render()', 'request locals', 'admin API group'],
	},
];

export const studioCrew: CrewMember[] = [
	{ name: 'Ari', focus: 'Core runtime', track: 'Semantic render layers' },
	{ name: 'Lin', focus: 'DX and docs', track: 'MDX + examples' },
	{ name: 'Sam', focus: 'Server APIs', track: 'Grouped handlers' },
	{ name: 'Jules', focus: 'Playgrounds', track: 'Kitchen sink verification' },
];

export const liveAnnouncements: Announcement[] = [
	{
		id: 'welcome-shells',
		title: 'Semantic shells are active',
		message: 'The app now resolves html and 404 by semantic basename. No template filename config remains.',
		createdBy: 'system',
		createdAt: 'boot',
	},
	{
		id: 'ops-lane',
		title: 'Admin API lane available',
		message: 'Use x-kitchen-role: admin to create new announcements through the grouped handler demo.',
		createdBy: 'system',
		createdAt: 'boot',
	},
];
