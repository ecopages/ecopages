/**
 * Removes scoped e2e fixture build outputs so Playwright static builds do not
 * reuse stale incremental caches after workspace package changes.
 */
import { readdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const fixturesRoot = path.join(repoRoot, 'e2e', 'fixtures');

const SCOPED_ARTIFACT_PATTERN = /^(?:dist(?:-.+)?|\.eco(?:-.+)?)$/;

function removeScopedArtifacts(fixtureDir) {
	let entries;

	try {
		entries = readdirSync(fixtureDir);
	} catch {
		return;
	}

	for (const entry of entries) {
		if (!SCOPED_ARTIFACT_PATTERN.test(entry)) {
			continue;
		}

		const artifactPath = path.join(fixtureDir, entry);

		try {
			if (!statSync(artifactPath).isDirectory()) {
				continue;
			}
		} catch {
			continue;
		}

		rmSync(artifactPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
	}
}

let fixtureDirs;

try {
	fixtureDirs = readdirSync(fixturesRoot, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => path.join(fixturesRoot, entry.name));
} catch {
	process.exit(0);
}

for (const fixtureDir of fixtureDirs) {
	removeScopedArtifacts(fixtureDir);
}
