import { type PostInstallEntry } from "./process";

export {};

interface SpawnOptions {
  cwd?: string;
  env?: Record<string, string>;
  shell?: boolean | string;
  stdio?: any;          // обычно 'pipe' | 'ignore' | 'inherit' или массив
  stdioString?: boolean;
}

interface FakeChildProcess {
  stdout: {
    on(event: string, callback: (...args: any[]) => void): this;
  };
  stderr: {
    on(event: string, callback: (...args: any[]) => void): this;
  };
  on(event: 'error', callback: (err: Error) => void): this;
  on(event: 'close', callback: (code: number | null, signal: string | null) => void): this;
  on(event: string, callback: (...args: any[]) => void): this;
}

type CastomSpawn = (
  command: string,
  args: string[],
  options: SpawnOptions
) => FakeChildProcess;

declare global {
  var CASTOM_SPAWN: CastomSpawn;
}