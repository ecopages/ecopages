export function parseArgs(args: string[]): {
	group: string;
	forwardedArgs: string[];
};

export function buildPlaywrightArgs(group: string, forwardedArgs: string[]): string[];
