type StaticRenderProbe = {
	activeRenders: number;
	peakConcurrentRenders: number;
	arrivals: number;
	barrier: Promise<void>;
	releaseBarrier: () => void;
};

type StaticRenderProbeGlobal = typeof globalThis & {
	__ecopagesStaticRenderProbe?: StaticRenderProbe;
};

function createStaticRenderProbe(): StaticRenderProbe {
	let releaseBarrier = () => {};
	const barrier = new Promise<void>((resolve) => {
		releaseBarrier = resolve;
	});

	return { activeRenders: 0, peakConcurrentRenders: 0, arrivals: 0, barrier, releaseBarrier };
}

const runtimeGlobal = globalThis as StaticRenderProbeGlobal;
const probe = (runtimeGlobal.__ecopagesStaticRenderProbe ??= createStaticRenderProbe());

/**
 * Blocks the two fixture Pages at one shared point during static export.
 *
 * @remarks
 * The timeout lets the build finish if route rendering regresses to serial execution. In that
 * case the returned peak remains one and the browser test reports the concurrency failure.
 */
export async function waitForPeerStaticRender(): Promise<number> {
	probe.activeRenders += 1;
	probe.peakConcurrentRenders = Math.max(probe.peakConcurrentRenders, probe.activeRenders);
	probe.arrivals += 1;

	if (probe.arrivals >= 2) {
		probe.releaseBarrier();
	} else {
		let timeout: ReturnType<typeof setTimeout> | undefined;
		try {
			await Promise.race([
				probe.barrier,
				new Promise<void>((resolve) => {
					timeout = setTimeout(resolve, 5_000);
				}),
			]);
		} finally {
			if (timeout) clearTimeout(timeout);
		}
	}

	const peakConcurrentRenders = probe.peakConcurrentRenders;
	probe.activeRenders -= 1;
	return peakConcurrentRenders;
}
