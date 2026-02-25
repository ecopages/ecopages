import { readFileSync } from 'node:fs';

export function formatDate(date: Date) {
	return date.toLocaleDateString();
}

/** SERVER ONLY: Never expose to client! */
export function dbSecretQuery() {
	return readFileSync('/etc/passwd', 'utf8');
}
