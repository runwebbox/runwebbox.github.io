import type { FSEntry } from '../../engine/fileSystem.ts';
import { BaseLoader, type ProgressCallback, type ZipParams } from '../types.ts';
/*
 Загружает файловую систему из base64. Поддерживает несколько файлов.
*/
export default class ZipLoader extends BaseLoader {
  readonly name = 'Zip Loader';
  readonly params: ZipParams;
  readonly onProgress: ProgressCallback;

  constructor(params: ZipParams, onProgress: ProgressCallback) {
    super();
    this.params = params;
    this.onProgress = onProgress;
  }

  protected async performLoad(): Promise<FSEntry> {
    /*
    const json = await this.fetch_json(this.params.url, 0, 2);
    for (let i=0;i<1000;i++){
    this.onProgress({message:'test', percent: i/3});
    await new Promise(r => setTimeout(r, 10));
    }
    this.onProgress({message:'test', percent: 50});
    await new Promise(r => setTimeout(r, 2000));*/
    return { name: 'ex.json', content: new TextEncoder().encode('') };
  }
}
