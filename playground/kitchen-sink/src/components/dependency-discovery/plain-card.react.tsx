/** @jsxImportSource react */

import '@ecopages/e2e-package-css-lib/style.css';
import './plain-card.css';

export function PlainCard({ label }: { label: string }) {
	return <p className="discovery-plain-card package-css-lib-badge">{label}</p>;
}
