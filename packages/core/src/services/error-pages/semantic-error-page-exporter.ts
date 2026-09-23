import type { RouteRendererBody } from '../../types/public-types.ts';
import { ErrorPageRenderer, type ErrorPageKind } from './error-page-renderer.ts';

type StaticArtifactWriter = (input: {
	pathname: string;
	sourceFile?: string;
	createContents: () => Promise<string | Buffer>;
	activeStaticPathnames: Set<string>;
}) => Promise<void>;

/**
 * Emits semantic 404 and 500 artifacts using the same renderer as requests.
 */
export class SemanticErrorPageExporter {
	private readonly errorPageRenderer: ErrorPageRenderer;
	private readonly writeArtifact: StaticArtifactWriter;

	constructor({
		errorPageRenderer,
		writeArtifact,
	}: {
		errorPageRenderer: ErrorPageRenderer;
		writeArtifact: StaticArtifactWriter;
	}) {
		this.errorPageRenderer = errorPageRenderer;
		this.writeArtifact = writeArtifact;
	}

	async export(activeStaticPathnames: Set<string>): Promise<void> {
		await Promise.all([
			this.exportOne('notFound', '/404', activeStaticPathnames),
			this.exportOne('serverError', '/500', activeStaticPathnames),
		]);
	}

	private async exportOne(kind: ErrorPageKind, pathname: string, activeStaticPathnames: Set<string>): Promise<void> {
		if (activeStaticPathnames.has(pathname)) {
			return;
		}

		const sourceFile = await this.errorPageRenderer.resolveSourceFile(kind);
		await this.writeArtifact({
			pathname,
			sourceFile,
			activeStaticPathnames,
			createContents: async () => this.bodyToStaticContents((await this.errorPageRenderer.render({ kind })).body),
		});
	}

	private async bodyToStaticContents(body: RouteRendererBody): Promise<string | Buffer> {
		if (typeof body === 'string' || Buffer.isBuffer(body)) {
			return body;
		}
		return await new Response(body as BodyInit).text();
	}
}
