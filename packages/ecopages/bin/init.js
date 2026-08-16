import { downloadTemplate } from 'giget';
import * as prompts from '@clack/prompts';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { basename, join } from 'node:path';
import { parseArgs } from 'node:util';
import { printBrandBanner, withBrandBanner } from './brand.js';
import { normalizeGitSource } from './git-template-source.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8'));
const templateManifest = JSON.parse(readFileSync(new URL('../templates.json', import.meta.url), 'utf-8'));
const officialTemplates = [...templateManifest.templates].sort((left, right) => left.order - right.order);
const defaultOfficialTemplate = officialTemplates.find((template) => template.default) ?? officialTemplates[0];

const initOptionDefinitions = {
	template: {
		type: 'string',
	},
	repo: {
		type: 'string',
	},
	from: {
		type: 'string',
	},
	interactive: {
		type: 'boolean',
	},
	'no-interactive': {
		type: 'boolean',
	},
	install: {
		type: 'boolean',
	},
	'no-install': {
		type: 'boolean',
	},
	start: {
		type: 'boolean',
	},
	'no-start': {
		type: 'boolean',
	},
	help: {
		type: 'boolean',
		short: 'h',
	},
};

function getInitCommandHelpText() {
	return [
		'Usage: ecopages init [dir] [options]',
		'',
		'Initialize a new project from a template.',
		'',
		'With no directory in a TTY, starts the interactive project creator.',
		'',
		'Options:',
		'      --template <id>                     Official template ID',
		'      --from <source>                     Community Git template source',
		'      --interactive                       Force interactive mode',
		'      --no-interactive                    Disable interactive mode',
		'      --install                           Install dependencies',
		'      --no-install                        Skip dependency installation',
		'      --start                             Install and start the dev server',
		'      --no-start                          Do not start the dev server',
		'  -h, --help                              Show help',
	].join('\n');
}

function parseExclusiveBoolean(enable, disable, enableFlag, disableFlag) {
	if (enable && disable) {
		throw new Error(`The \`${enableFlag}\` and \`${disableFlag}\` options cannot be used together.`);
	}
	if (enable) return true;
	if (disable) return false;
	return undefined;
}

function parseInitCommandArgs(rawArgs) {
	const { values, positionals } = parseArgs({
		args: rawArgs,
		options: initOptionDefinitions,
		allowPositionals: true,
		strict: true,
	});

	if (values.help) {
		console.log(withBrandBanner(pkg.version, getInitCommandHelpText()));
		return { help: true };
	}

	if (positionals.length > 1) {
		throw new Error('The `init` command accepts at most one target directory argument.');
	}

	if (values.template && values.from) {
		throw new Error('The `--template` and `--from` options cannot be used together.');
	}

	if (values.repo) {
		throw new Error('The `--repo` option was removed. Use `--from <source>` instead.');
	}

	const interactive = parseExclusiveBoolean(
		values.interactive,
		values['no-interactive'],
		'--interactive',
		'--no-interactive',
	);
	const install = parseExclusiveBoolean(values.install, values['no-install'], '--install', '--no-install');
	const start = parseExclusiveBoolean(values.start, values['no-start'], '--start', '--no-start');

	if (start && install === false) {
		throw new Error('The `--start` option requires dependency installation.');
	}

	const dir = positionals[0];
	const useInteractive = interactive ?? (!dir && Boolean(process.stdin.isTTY));

	if (!dir && !useInteractive) {
		throw new Error(
			'A target directory is required outside a TTY. Run `ecopages init --interactive` to use prompts.',
		);
	}

	return {
		dir,
		template: values.template,
		from: values.from,
		interactive: useInteractive,
		install,
		start,
	};
}

function findOfficialTemplate(templateId) {
	const template = officialTemplates.find((candidate) => candidate.id === templateId);
	if (!template) {
		const available = officialTemplates.map((candidate) => candidate.id).join(', ');
		throw new Error(`Unknown official template '${templateId}'. Available templates: ${available}`);
	}

	return template;
}

function detectPackageManager() {
	const userAgent = process.env.npm_config_user_agent || '';
	if (userAgent.startsWith('bun/')) return 'bun';
	if (userAgent.startsWith('pnpm/')) return 'pnpm';
	return 'npm';
}

function getTemplateSource(templateId, source) {
	if (source) return normalizeGitSource(source);
	const officialTemplate = findOfficialTemplate(templateId);
	return `github:ecopages/ecopages/templates/${officialTemplate.source}#v${pkg.version}`;
}

function runChildCommand(command, args, cwd) {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, { cwd, stdio: 'inherit' });
		child.on('error', reject);
		child.on('exit', (code, signal) => {
			if (signal) {
				reject(new Error(`${command} was terminated by ${signal}.`));
				return;
			}

			if (code !== 0) {
				reject(new Error(`${command} exited with code ${code ?? 1}.`));
				return;
			}

			resolve();
		});
	});
}

function rewriteWorkspaceDependencies(projectPkg) {
	for (const blockName of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
		const block = projectPkg[blockName];
		if (!block || typeof block !== 'object') continue;
		for (const [name, version] of Object.entries(block)) {
			if (version === 'workspace:*') block[name] = pkg.version;
		}
	}
}

function updateProjectManifest(targetDir, packageDirectory, isOfficial) {
	const packagePath = join(targetDir, packageDirectory, 'package.json');
	if (!existsSync(packagePath)) {
		throw new Error(`Template package directory '${packageDirectory}' does not contain a package.json.`);
	}

	const projectPkg = JSON.parse(readFileSync(packagePath, 'utf-8'));
	projectPkg.name = basename(targetDir);
	if (isOfficial) rewriteWorkspaceDependencies(projectPkg);

	if (isOfficial) {
		for (const blockName of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
			const block = projectPkg[blockName];
			if (!block || typeof block !== 'object') continue;
			if (
				Object.values(block).some((version) => typeof version === 'string' && version.startsWith('workspace:'))
			) {
				throw new Error(`Template package still contains workspace dependencies in ${packagePath}.`);
			}
		}
	}

	writeFileSync(packagePath, `${JSON.stringify(projectPkg, null, 2)}\n`);
	return packagePath;
}

function isCancelled(value) {
	if (prompts.isCancel(value)) {
		prompts.cancel('Project creation cancelled.');
		return true;
	}
	return false;
}

async function collectInitAnswers(parsed) {
	const packageManager = detectPackageManager();
	let dir = parsed.dir;
	let templateId = parsed.template;
	let source = parsed.from;

	if (parsed.interactive) {
		if (!dir) {
			const answer = await prompts.text({
				message: 'Project directory:',
				placeholder: 'my-app',
				validate: (value) => (value.trim().length === 0 ? 'Enter a project directory.' : undefined),
			});
			if (isCancelled(answer)) return null;
			dir = answer.trim();
		}

		if (!templateId && !source) {
			const answer = await prompts.select({
				message: 'Select a template:',
				options: [
					...officialTemplates.map((template) => ({
						label: template.displayName,
						value: template.id,
						hint: template.description,
					})),
					{
						label: 'Community template',
						value: '__community__',
						hint: 'Use a Git repository or provider source.',
					},
				],
			});
			if (isCancelled(answer)) return null;
			if (answer === '__community__') {
				const sourceAnswer = await prompts.text({
					message: 'Template source:',
					placeholder: 'github:owner/repository#v1.0.0',
					validate: (value) => (value.trim().length === 0 ? 'Enter a Git template source.' : undefined),
				});
				if (isCancelled(sourceAnswer)) return null;
				source = sourceAnswer.trim();
			} else {
				templateId = answer;
			}
		}
	}

	if (!templateId && !source) templateId = defaultOfficialTemplate.id;
	if (parsed.interactive) {
		prompts.log.step(`Resolved template source: ${getTemplateSource(templateId, source)}`);
	}

	let install = parsed.start ? true : parsed.install;
	if (install === undefined && parsed.interactive) {
		const answer = await prompts.confirm({
			message: `Install dependencies with ${packageManager}?`,
			initialValue: true,
		});
		if (isCancelled(answer)) return null;
		install = answer;
	}
	install ??= false;

	let start = parsed.start;
	if (start === undefined && parsed.interactive && install) {
		const answer = await prompts.confirm({ message: 'Start the development server now?', initialValue: false });
		if (isCancelled(answer)) return null;
		start = answer;
	}
	start ??= false;

	return { dir, templateId, source, packageManager, install, start };
}

export async function runInitCommand(rawArgs, logger) {
	const parsed = parseInitCommandArgs(rawArgs);
	if (parsed.help) return;

	printBrandBanner(pkg.version);
	const answers = await collectInitAnswers(parsed);
	if (!answers) return;

	const { dir, templateId, source, packageManager, install, start } = answers;
	if (existsSync(dir)) throw new Error(`Target directory already exists: ${dir}`);

	const officialTemplate = source ? null : findOfficialTemplate(templateId);
	const templateSource = getTemplateSource(templateId, source);
	const packageDirectory = officialTemplate?.packageDirectory ?? '.';
	let targetCreated = false;

	try {
		if (!parsed.interactive) prompts.log.step(`Resolved template source: ${templateSource}`);
		prompts.log.step(`Downloading ${officialTemplate?.displayName ?? 'community template'}...`);
		targetCreated = true;
		await downloadTemplate(templateSource, { dir, force: true });
		prompts.log.step('Preparing project manifest...');
		updateProjectManifest(dir, packageDirectory, Boolean(officialTemplate));
		prompts.log.step(`Project created in ${dir}.`);

		const packageCwd = join(dir, packageDirectory);
		if (install) {
			prompts.log.step(`Installing dependencies with ${packageManager}...`);
			await runChildCommand(packageManager, ['install'], packageCwd);
		}
		if (start) {
			prompts.log.step('Starting the development server...');
			await runChildCommand(packageManager, ['run', 'dev'], packageCwd);
		}

		const relativeCwd = packageDirectory === '.' ? dir : join(dir, packageDirectory);
		logger.info(
			`Project initialized. Run 'cd "${relativeCwd}" && ${packageManager} install && ${packageManager} run dev'.`,
		);
	} catch (error) {
		if (targetCreated) rmSync(dir, { recursive: true, force: true });
		throw error;
	}
}
