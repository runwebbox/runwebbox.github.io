

export interface SpawnOptionsWithoutStdio {
cwd?: string;
env?: Record<string, string | undefined>;
shell?: string | boolean;
stdio?: string;
stdioString?: boolean;
}


export type PostInstallEntry = [
  command: string,
  args: string[],
  options: SpawnOptionsWithoutStdio
];