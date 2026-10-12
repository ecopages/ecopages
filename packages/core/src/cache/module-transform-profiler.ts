type ProfileRecord = {
	category: string;
	phase: string;
	ms: number;
};

export function recordModuleTransformProfile(record: ProfileRecord): void {
	if (process.env.ECO_AST_PROFILE !== '1') return;
	console.info(
		`[ecopages:ast-profile] ${JSON.stringify({
			...record,
			ms: Number(record.ms.toFixed(3)),
		})}`,
	);
}
