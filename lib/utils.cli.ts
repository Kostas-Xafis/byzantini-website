type CLI_Profile = "pwsh" | "bash";

export class CLI {
	private profile: CLI_Profile = "bash";
	private command = "";
	constructor() { }
	async exec<T>(options: { signal?: AbortSignal; } = {}): Promise<T> {
		// Powershell is no longer supported
		// const initialCommand = this.profile === "pwsh" ?
		// 	`powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "${this.command}"`
		// 	: `bash -c "${this.command}"`;
		const safe_exec = (await eval(`import('child_process')`)).exec as typeof import("child_process").exec;
		const initialCommand = `bash -c "${this.command}"`;
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
	setProfile(profile: "pwsh" | "bash") {
		this.profile = profile;
	}
	setCommand(command: string | string[]) {
		this.command = Array.isArray(command) ? command.join(" ; ") : command;
	}

	static async executeCommands<T>(commands: string | string[], signal?: AbortSignal, profile: CLI_Profile = "bash") {
		const cli = new CLI();
		cli.setProfile(profile);
		cli.setCommand(commands);
		return cli.exec<T>({ signal });
	}
}
