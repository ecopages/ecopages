import { exec } from "node:child_process";
import path from "node:path";
import { CssBuilder } from "@/build/css-builder";
import { ScriptsBuilder } from "@/build/scripts-builder";
import { ProjectWatcher } from "@/build/watcher";
import "@/global/console";
import { FileSystemServer } from "@/server/fs-server";
import { StaticContentServer } from "@/server/sc-server";
import { FileUtils } from "@/utils/file-utils";
import type { EcoPagesConfig } from "@types";
import { PostCssProcessor } from "./postcss-processor";
import type { StaticPageGenerator } from "./static-page-generator";

type AppBuilderOptions = {
	watch: boolean;
	serve: boolean;
	build: boolean;
};

export class AppBuilder {
	config: EcoPagesConfig;
	staticPageGenerator: StaticPageGenerator;
	cssBuilder: CssBuilder;
	scriptsBuilder: ScriptsBuilder;
	options: AppBuilderOptions;

	constructor({
		config,
		staticPageGenerator,
		cssBuilder,
		scriptsBuilder,
		options,
	}: {
		config: EcoPagesConfig;
		staticPageGenerator: StaticPageGenerator;
		cssBuilder: CssBuilder;
		scriptsBuilder: ScriptsBuilder;
		options: AppBuilderOptions;
	}) {
		this.config = config;
		this.staticPageGenerator = staticPageGenerator;
		this.cssBuilder = cssBuilder;
		this.scriptsBuilder = scriptsBuilder;
		this.options = options;
	}

	prepareDistDir() {
		FileUtils.ensureFolderExists(this.config.distDir, true);
	}

	copyPublicDir() {
		const { srcDir, publicDir, distDir } = this.config;
		FileUtils.copyDirSync(
			path.join(srcDir, publicDir),
			path.join(distDir, publicDir),
		);
	}

	execTailwind({
		minify,
		watch,
		input,
		output,
	}: {
		minify: boolean;
		watch: boolean;
		input: string;
		output: string;
	}) {
		exec(
			`bunx tailwindcss -i ${input} -o ${output} ${watch ? "--watch" : ""} ${
				minify ? "--minify" : ""
			}`,
		);
	}

	private async runDevServer() {
		const { server } = await FileSystemServer.create({
			watchMode: this.options.watch,
		});
		console.log(
			`[eco-pages] Server running at http://localhost:${server.port}`,
		);
	}

	async serve() {
		await this.runDevServer();
	}

	async watch() {
		this.runDevServer();

		const cssBuilder = new CssBuilder({
			processor: new PostCssProcessor(),
			config: globalThis.ecoConfig,
		});

		const scriptsBuilder = new ScriptsBuilder({
			config: globalThis.ecoConfig,
			options: { watchMode: true },
		});

		const watcherInstance = new ProjectWatcher(cssBuilder, scriptsBuilder);
		const subscription = await watcherInstance.createWatcherSubscription();

		process.on("SIGINT", async () => {
			await subscription.unsubscribe();
			process.exit(0);
		});
	}

	async buildStatic() {
		await this.staticPageGenerator.run();
		if (this.options.build) {
			console.log("[eco-pages] Build completed");
			process.exit(0);
		}

		const { server } = StaticContentServer.create({
			watchMode: this.options.watch,
		});
		console.log(
			`[eco-pages] Preview running at http://localhost:${server!.port}`,
		);
	}

	async run() {
		const { srcDir, globalDir, distDir } = this.config;

		this.prepareDistDir();
		this.copyPublicDir();

		this.execTailwind({
			minify: !this.options.watch,
			watch: this.options.watch,
			input: `${srcDir}/${globalDir}/css/tailwind.css`,
			output: `${distDir}/${globalDir}/css/tailwind.css`,
		});

		await this.cssBuilder.build();
		await this.scriptsBuilder.build();

		if (this.options.watch) {
			return await this.watch();
		}

		FileUtils.gzipDirSync(distDir, ["css", "js"]);

		if (this.options.serve) {
			return await this.serve();
		}

		return await this.buildStatic();
	}
}
