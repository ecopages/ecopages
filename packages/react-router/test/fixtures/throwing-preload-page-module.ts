export async function preload(): Promise<void> {
	throw new Error('page preload failed');
}

export default function ThrowingPreloadPage() {
	return null;
}
