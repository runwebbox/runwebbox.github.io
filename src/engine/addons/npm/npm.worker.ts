/// <reference lib="webworker" />
import 'setimmediate';
import { Volume, createFsFromVolume, type IFs } from 'memfs';
import { runNpmCli } from 'npm-in-browser';
import { type PostInstallEntry, type SpawnOptionsWithoutStdio } from "./process";

// Типы сообщений для основного потока
interface WorkerMessage {
  command: string[];
  cwd: string;
  files?: Record<string, string>; // файлы для инициализации ФС
}

// Типы ответов воркера
type WorkerResponse =
  | { type: 'stdout'; data: string }
  | { type: 'stderr'; data: string }
  | { type: 'timing-start'; name: string }
  | { type: 'timing-end'; name: string }
  | { type: 'done'; result: Record<string, string>, post_install: PostInstallEntry[]}
  | { type: 'error'; error: string };

self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const { command, cwd, files = {} } = event.data;

  // Создаём изолированную файловую систему в памяти с начальными файлами
  // Volume.fromJSON принимает объект { [filePath]: content } и базовый каталог
  const vol = Volume.fromJSON(files, cwd);
  const fs = createFsFromVolume(vol);

  // Функции для отправки вывода обратно в главный поток
  const stdout = (chunk: any) => {
    self.postMessage({ type: 'stdout', data: String(chunk) } as WorkerResponse);
  };
  const stderr = (chunk: any) => {
    self.postMessage({ type: 'stderr', data: String(chunk) } as WorkerResponse);
  };

  try {
    // Если нужно, можно вывести информацию о созданных файлах
    if (Object.keys(files).length > 0) {
      stdout(`Initialized ${Object.keys(files).length} file(s) in ${cwd}\n`);
    }
    debugger;
    const post_install: PostInstallEntry[] = [];
    globalThis.CASTOM_SPAWN = (command: string, args: string[], options: SpawnOptionsWithoutStdio)=>{
              post_install.push([
                command,
                args,
                options
              ]);

              const process = {
                stdout: {
                  on: function(/*event, callback*/) {
                    return this;
                  }
                },
                stderr: {
                  on: function(/*event, callback*/) {
                    return this;
                  }
                },
                on: function(event: 'error' | 'close', callback: (...args: any[]) => void) {
                  if (event === 'error') {
                  }
                  if (event === 'close') {
                    setTimeout(() => callback(0, null), 20);
                  }
                  return this;
                }
              };

              return process;
            };

    await runNpmCli(command, {
      fs,
      cwd,
      stdout,
      stderr,
      timings: {
        start(name) {
          self.postMessage({ type: 'timing-start', name } as WorkerResponse);
        },
        end(name) {
          self.postMessage({ type: 'timing-end', name } as WorkerResponse);
        },
      },
    });

    let result: Record<string, string | null> = vol.toJSON();

    self.postMessage({ type: 'done', result, post_install } as WorkerResponse);
  } catch (err: any) {
    self.postMessage({ type: 'error', error: err.message } as WorkerResponse);
  }
};