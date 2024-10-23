import { type RemoveFlag } from "../types/helpers";
import { silentImport } from "./utils.server";
type CLI_Profile = "pwsh" | "bash";

export class CLI {
	private static profile: CLI_Profile;
	private command = "";
	constructor(command?: string | string[]) {
		if (!CLI.profile) {
			silentImport<typeof import('os')>('os').then(os => CLI.profile = (os.platform() === 'win32' ? 'pwsh' : 'bash'));
		}
		command && this.setCommand(command);
	}
	async exec<T>(options: { signal?: AbortSignal; } = {}): Promise<T> {
		// Powershell is no longer supported
		const { exec: safe_exec } = (await silentImport<typeof import("child_process")>("child_process"));

		const initialCommand = CLI.profile === "pwsh" ?
			`powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "${this.command}"`
			: `bash -c "${this.command}"`;
		return new Promise((resolve, reject) => {
			safe_exec(initialCommand, options, (error, stdout, stderr) => {
				if (error) {
					reject(error);
				}
				if (stderr) {
					resolve(stderr as unknown as T);
				}
				resolve(stdout as T);
			});
		});
	}
	setCommand(command: string | string[]) {
		this.command = Array.isArray(command) ? command.join(" ; ") : command;
		this.command = this.command.replace(/"/g, '\\"');
	}

	static async executeCommands<T>(commands: string | string[], signal?: AbortSignal, profile: CLI_Profile = "bash") {
		const cli = new CLI();
		CLI.profile = profile;
		cli.setCommand(commands);
		return cli.exec<T>({ signal });
	}
}

type FlagRule = "--" | "-" | string;
//@ts-ignore
export const argReader = <T extends Record<string, any>>(args: string[], flagRule: FlagRule = '--'): RemoveFlag<T, "--"> => {
	let argObj = {} as Record<string, any>;
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		// Distinguish between flags and key-value pairs
		if (arg.startsWith(flagRule)) {
			argObj[arg.slice(2)] = args[i + 1] === undefined || args[i + 1]?.startsWith("--") ? true : args[i + 1];
		}
	}
	return argObj as RemoveFlag<T, "--">;
};
