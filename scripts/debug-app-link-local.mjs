import fs from 'node:fs';

function toFileSpec(absolutePath) {
	return `file:${absolutePath}`;
}

export function rewritePackageJsonForLocalDist(packageJson, matchedPackages) {
	for (const section of ['dependencies', 'devDependencies', 'optionalDependencies']) {
		for (const [name, targetPath] of Object.entries(matchedPackages)) {
			if (packageJson[section]?.[name]) {
				packageJson[section][name] = toFileSpec(targetPath);
			}
		}
	}
}

export function applyWorkspaceOverrides(workspaceYamlPath, workspaceBackup, matchedPackages) {
	const fileOverrides = Object.fromEntries(
		Object.entries(matchedPackages).map(([name, targetPath]) => [name, toFileSpec(targetPath)]),
	);
	const lines = workspaceBackup.split('\n');
	const overridesIndex = lines.findIndex((line) => line.trim() === 'overrides:');
	if (overridesIndex === -1) {
		throw new Error(`Could not find overrides block in ${workspaceYamlPath}`);
	}

	let endIndex = overridesIndex + 1;
	while (endIndex < lines.length && /^\s{4}\S/.test(lines[endIndex] ?? '')) {
		endIndex += 1;
	}

	const overrideLines = Object.entries(fileOverrides).map(
		([name, spec]) => `    ${JSON.stringify(name)}: ${JSON.stringify(spec)}`,
	);
	const nextLines = [...lines.slice(0, endIndex), ...overrideLines, ...lines.slice(endIndex)];
	fs.writeFileSync(workspaceYamlPath, `${nextLines.join('\n')}\n`, 'utf8');
}
