import type { FSEntry } from '../../engine/fileSystem.ts';
import {
  BaseLoader,
  type ProgressCallback,
  type ContentParams,
} from '../types.ts';
/*
 Загружает файловую систему из base64. Поддерживает только один html файл.
*/
export default class ContentLoader extends BaseLoader {
  readonly name = 'Direct Loader';
  readonly params: ContentParams;
  readonly onProgress: ProgressCallback;

  constructor(params: ContentParams, onProgress: ProgressCallback) {
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
    return {
      name: 'index.html',
      content: new TextEncoder().encode(this.params.data),
    };
  }
}
