type CLI_Profile = "pwsh" | "bash";

export const createCLI = async () => {
	const exec = (await eval(`import('child_process')`)).exec as typeof import("child_process").exec;
	let profile: CLI_Profile = "pwsh";
	let command = "";
	return {
		exec: <T>(options: { signal?: AbortSignal; } = {}): Promise<T> => {
			const initialCommand = profile === "pwsh" ?
				`powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "${command}"`
				: "bash";
			return new Promise((resolve, reject) => {
				exec(initialCommand, options, (error, stdout, stderr) => {
					if (error) {
						reject(error);
					}
					if (stderr) {
						resolve(stderr as unknown as T);
					}
					resolve(stdout as T);
				});
			});
		},
		setProfile: (_profile: "pwsh" | "bash") => {
			profile = _profile;
		},
		setCommand: (_command: string | string[]) => {
			command = Array.isArray(_command) ? _command.join(" ; ") : _command;
		}
	};
};

export const executeCommands = async <T>(commands: string | string[], signal?: AbortSignal, profile: CLI_Profile = "pwsh") => {
	const cli = await createCLI();
	cli.setProfile(profile);
	cli.setCommand(commands);
	return cli.exec<T>({ signal });
};
