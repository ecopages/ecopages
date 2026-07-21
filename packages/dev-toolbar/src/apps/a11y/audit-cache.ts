import type { A11yIssueView } from './run-a11y-checks.ts';

const auditCache = new Map<string, A11yIssueView[]>();

export function auditCacheKey(doc: Document): string {
	return doc.defaultView?.location.href ?? '';
}

export function readAuditCache(doc: Document): A11yIssueView[] | undefined {
	return auditCache.get(auditCacheKey(doc));
}

export function writeAuditCache(doc: Document, issues: A11yIssueView[]): void {
	auditCache.set(auditCacheKey(doc), issues);
}

export function clearAuditCache(doc: Document): void {
	auditCache.delete(auditCacheKey(doc));
}

export function resetAuditCacheForTests(): void {
	auditCache.clear();
}
