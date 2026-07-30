type ProfileRecord = {
	category: string;
	phase: string;
	ms: number;
	cacheHit?: boolean;
};

const records: ProfileRecord[] = [];

export function recordModuleTransformProfile(record: ProfileRecord): void {
	if (process.env.ECO_AST_PROFILE !== '1') return;
	records.push(record);
}

export function flushModuleTransformProfile(reason: string): void {
	if (process.env.ECO_AST_PROFILE !== '1' || records.length === 0) return;
	const summary = new Map<string, { count: number; ms: number; hits: number }>();
	for (const record of records) {
		const key = `${record.category}:${record.phase}`;
		const current = summary.get(key) ?? { count: 0, ms: 0, hits: 0 };
		current.count += 1;
		current.ms += record.ms;
		if (record.cacheHit) current.hits += 1;
		summary.set(key, current);
	}
	console.info(
		`[ecopages:ast-profile] ${reason} ${JSON.stringify(
			Array.from(summary, ([phase, value]) => ({ phase, ...value })),
		)}`,
	);
	records.length = 0;
}
