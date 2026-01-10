import type { Packet } from '../packet';
import type {
  EventFromMachineFunction,
  EventMapToMachine,
  MachineModule,
} from './MachineModule';
import { TCPParser } from '../TCPParser';
import type { staticServerConfig } from '../../types/webBoxConfig';
import { type FSEntryInfo, type FileSystemAPI } from '../fileSystem';
import type { LogLvls } from '../log';

/**
 * Интерфейс HTTP запроса
 */
interface HTTPRequest {
  method: string;
  path: string;
  version: string;
  headers: Record<string, string>;
  body: string;
}

export default class StaticServer implements MachineModule {
  private config: staticServerConfig;
  private fileSystem: FileSystemAPI;
  private sendPacket: (packet: Packet, port: number) => void;
  private log: (s: string, lvl?: LogLvls) => void;
  private tcpParser: TCPParser;
  private port = 80; // HTTP порт по умолчанию

  constructor(
    config: staticServerConfig,
    fileSystem: FileSystemAPI,
    sendPacket: (packet: Packet, port: number) => void,
    sendEvent: EventFromMachineFunction
  ) {
    this.config = config;
    this.fileSystem = fileSystem;
    this.sendPacket = sendPacket;
    this.log = (log, lvl = 'info') => sendEvent('log', { log, lvl });

    // Конвертируем IP из [number, number, number, number] в Uint8Array
    const ip = new Uint8Array(config.ip);

    // Предполагаем, что MAC адрес передается как строка "xx:xx:xx:xx:xx:xx"
    const macArray = config.mac.split(':').map(hex => parseInt(hex, 16));
    const mac = new Uint8Array(macArray);

    // Создаем TCP парсер для обработки HTTP запросов
    this.tcpParser = new TCPParser(
      mac,
      ip,
      (packet: Packet) => (console.log(packet), this.sendPacket(packet, 0)),
      [this.port], // Открываем HTTP порт
      this.handleHTTPRequest.bind(this) // Колбэк для обработки HTTP данных
    );
  }

  async start(): Promise<void> {
    this.log('Starting browser module');
  }

  async stop(): Promise<void> {
    this.log('Stopping browser module');
  }

  handleEvent<T extends keyof EventMapToMachine>(
    type: T
    //_data: EventMapToMachine[T]['payload']
  ): EventMapToMachine[T]['result'] {
    switch (type) {
      default:
        throw new Error(`Unknown event type: ${type}`);
    }
  }

  /**
   * Обработка входящих пакетов
   */
  public handlePacket(packet: Packet): void {
    this.tcpParser.handlePacket(packet);
  }

  /**
   * Обработка HTTP запросов
   */
  private async handleHTTPRequest(
    ip: Uint8Array,
    remotePort: number,
    localPort: number,
    data: Uint8Array
    //_EOF: boolean
  ): Promise<void> {
    try {
      // Декодируем HTTP запрос
      const requestText = new TextDecoder().decode(data);
      const request = this.parseHTTPRequest(requestText);
      console.log(request);
      if (!request) {
        // Некорректный запрос
        //this.sendHTTPError(ip, remotePort, localPort, 400, 'Bad Request');
        return;
      }

      // Обрабатываем запрос
      await this.handleRequest(ip, remotePort, localPort, request);
    } catch (error) {
      console.error('Error handling HTTP request:', error);
      this.log(
        'Error handling HTTP request: ' + JSON.stringify(error),
        'error'
      );
      this.sendHTTPError(
        ip,
        remotePort,
        localPort,
        500,
        'Internal Server Error'
      );
    }
  }

  /**
   * Парсинг HTTP запроса
   */
  private parseHTTPRequest(requestText: string): HTTPRequest | null {
    const lines = requestText.split('\r\n');
    if (lines.length < 1) return null;

    // Парсим первую строку
    const firstLine = lines[0].split(' ');
    if (firstLine.length < 3) return null;

    const method = firstLine[0];
    const path = firstLine[1];
    const version = firstLine[2];

    // Парсим заголовки
    const headers: Record<string, string> = {};
    let i = 1;
    for (; i < lines.length; i++) {
      if (lines[i] === '') break; // Пустая строка означает конец заголовков

      const colonIndex = lines[i].indexOf(':');
      if (colonIndex > 0) {
        const key = lines[i].substring(0, colonIndex).trim();
        const value = lines[i].substring(colonIndex + 1).trim();
        headers[key] = value;
      }
    }

    // Тело запроса (если есть)
    const body = lines.slice(i + 1).join('\r\n');

    return {
      method,
      path,
      version,
      headers,
      body,
    };
  }

  /**
   * Обработка HTTP запроса
   */
  private async handleRequest(
    ip: Uint8Array,
    remotePort: number,
    localPort: number,
    request: HTTPRequest
  ): Promise<void> {
    // Поддерживаем только GET запросы для статического сервера
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      this.sendHTTPError(ip, remotePort, localPort, 405, 'Method Not Allowed');
      return;
    }

    try {
      // Нормализуем путь
      let filePath = this.normalizePath(request.path);

      // Если путь заканчивается на /, добавляем index.html
      if (filePath.endsWith('/')) {
        filePath += 'index.html';
      }

      // Проверяем безопасность пути (предотвращаем path traversal)
      if (!this.isPathSafe(filePath)) {
        this.sendHTTPError(ip, remotePort, localPort, 403, 'Forbidden');
        return;
      }

      // Полный путь в файловой системе
      const fullPath = this.config.path + filePath;

      // Проверяем существование файла
      const exists = await this.fileSystem.exists(fullPath);
      if (!exists) {
        this.sendHTTPError(ip, remotePort, localPort, 404, 'Not Found');
        return;
      }

      // Получаем информацию о файле
      const stat = this.fileSystem.stat(fullPath);

      // Если это директория
      if (stat.type == 'directory') {
        const dir = this.fileSystem.readDir(fullPath);
        // Перенаправляем на / в конце
        if (!request.path.endsWith('/')) {
          this.sendHTTPRedirect(ip, remotePort, localPort, request.path + '/');
          return;
        }

        // Показываем листинг директории
        if (this.config.showDirectoryListing !== false) {
          await this.sendDirectoryListing(
            ip,
            remotePort,
            localPort,
            filePath,
            dir
          );
          return;
        } else {
          this.sendHTTPError(ip, remotePort, localPort, 403, 'Forbidden');
          return;
        }
      }

      // Если это файл, отправляем его
      if (stat.type == 'file') {
        const file = await this.fileSystem.readFile(fullPath);
        await this.sendFile(
          ip,
          remotePort,
          localPort,
          fullPath,
          file,
          request.method === 'HEAD'
        );
      } else {
        this.sendHTTPError(
          ip,
          remotePort,
          localPort,
          500,
          'Internal Server Error'
        );
      }
    } catch (error) {
      console.error('Error handling request:', error);
      this.sendHTTPError(
        ip,
        remotePort,
        localPort,
        500,
        'Internal Server Error'
      );
    }
  }

  /**
   * Отправка файла
   */
  private async sendFile(
    ip: Uint8Array,
    remotePort: number,
    localPort: number,
    path: string,
    content: Uint8Array,
    headOnly: boolean
  ): Promise<void> {
    // Определяем Content-Type по расширению
    const contentType = this.getContentType(path);

    // Формируем заголовки
    const headers = [
      `HTTP/1.1 200 OK`,
      `Content-Type: ${contentType}`,
      `Content-Length: ${content.length}`,
      `Connection: close`,
      `Date: ${new Date().toUTCString()}`,
      `Server: StaticServer/1.0`,
      `\r\n`,
    ].join('\r\n');

    // Отправляем заголовки
    const headersData = new TextEncoder().encode(headers);
    this.tcpParser.send(ip, remotePort, localPort, headersData);

    // Для GET запроса отправляем тело
    if (!headOnly) {
      this.tcpParser.send(ip, remotePort, localPort, content);
    }

    // Отправляем событие о доступе к файлу
    this.log(
      'file_served ' +
        JSON.stringify({
          path,
          size: content.length,
          contentType,
        })
    );
  }

  /**
   * Отправка листинга директории
   */
  private async sendDirectoryListing(
    ip: Uint8Array,
    remotePort: number,
    localPort: number,
    path: string,
    dirStat: FSEntryInfo[]
  ): Promise<void> {
    // Генерируем HTML листинг
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Index of ${path}</title>
        <style>
          body { font-family: monospace; margin: 20px; }
          h1 { color: #333; }
          ul { list-style: none; padding-left: 0; }
          li { margin: 5px 0; }
          a { text-decoration: none; color: #0066cc; }
          a:hover { text-decoration: underline; }
          .dir { font-weight: bold; }
          .file { color: #666; }
        </style>
      </head>
      <body>
        <h1>Index of ${path}</h1>
        <ul>
          <li><a href="../">../</a></li>
          ${dirStat
            .map(
              item => `
            <li class="${item.type == 'directory' ? 'dir' : 'file'}">
              <a href="${encodeURI(item.name)}${item.type == 'directory' ? '/' : ''}">
                ${item.name}${item.type == 'directory' ? '/' : ''}
              </a>
            </li>
          `
            )
            .join('')}
        </ul>
      </body>
      </html>
    `;

    const content = new TextEncoder().encode(html);
    const headers = [
      `HTTP/1.1 200 OK`,
      `Content-Type: text/html; charset=utf-8`,
      `Content-Length: ${content.length}`,
      `Connection: close`,
      `Date: ${new Date().toUTCString()}`,
      `Server: StaticServer/1.0`,
      `\r\n`,
    ].join('\r\n');

    const headersData = new TextEncoder().encode(headers);
    this.tcpParser.send(ip, remotePort, localPort, headersData);
    this.tcpParser.send(ip, remotePort, localPort, content);
  }

  /**
   * Отправка HTTP ошибки
   */
  private sendHTTPError(
    ip: Uint8Array,
    remotePort: number,
    localPort: number,
    statusCode: number,
    statusText: string
  ): void {
    const statusMessages: Record<number, string> = {
      400: 'Bad Request',
      403: 'Forbidden',
      404: 'Not Found',
      405: 'Method Not Allowed',
      500: 'Internal Server Error',
    };

    const message = statusMessages[statusCode] || statusText;
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${statusCode} ${message}</title>
        <style>
          body { font-family: sans-serif; text-align: center; padding: 50px; }
          h1 { color: #d00; }
        </style>
      </head>
      <body>
        <h1>${statusCode} ${message}</h1>
        <p>The requested resource could not be found.</p>
      </body>
      </html>
    `;

    const content = new TextEncoder().encode(html);
    const headers = [
      `HTTP/1.1 ${statusCode} ${message}`,
      `Content-Type: text/html; charset=utf-8`,
      `Content-Length: ${content.length}`,
      `Connection: close`,
      `Date: ${new Date().toUTCString()}`,
      `Server: StaticServer/1.0`,
      `\r\n`,
    ].join('\r\n');

    const headersData = new TextEncoder().encode(headers);
    this.tcpParser.send(ip, remotePort, localPort, headersData);
    this.tcpParser.send(ip, remotePort, localPort, content);

    this.log(
      'http_error ' +
        JSON.stringify({
          statusCode,
          message,
          ip: Array.from(ip).join('.'),
        }),
      'error'
    );
  }

  /**
   * Отправка HTTP редиректа
   */
  private sendHTTPRedirect(
    ip: Uint8Array,
    remotePort: number,
    localPort: number,
    location: string
  ): void {
    const headers = [
      `HTTP/1.1 301 Moved Permanently`,
      `Location: ${location}`,
      `Content-Length: 0`,
      `Connection: close`,
      `Date: ${new Date().toUTCString()}`,
      `Server: StaticServer/1.0`,
      `\r\n`,
    ].join('\r\n');

    const headersData = new TextEncoder().encode(headers);
    this.tcpParser.send(ip, remotePort, localPort, headersData);
  }

  /**
   * Нормализация пути
   */
  private normalizePath(path: string): string {
    // Удаляем query string
    const queryIndex = path.indexOf('?');
    if (queryIndex > -1) {
      path = path.substring(0, queryIndex);
    }

    // Удаляем фрагмент
    const fragmentIndex = path.indexOf('#');
    if (fragmentIndex > -1) {
      path = path.substring(0, fragmentIndex);
    }

    // Разделяем путь на части
    const parts = path.split('/').filter(part => part !== '' && part !== '.');

    // Обрабатываем ..
    const result: string[] = [];
    for (const part of parts) {
      if (part === '..') {
        if (result.length > 0) {
          result.pop();
        }
      } else {
        result.push(part);
      }
    }

    return result.join('/');
  }

  /**
   * Проверка безопасности пути
   */
  private isPathSafe(path: string): boolean {
    const normalized = this.normalizePath(path);
    // Проверяем, что путь не выходит за пределы корневой директории
    return (
      !normalized.startsWith('../') &&
      normalized !== '..' &&
      !normalized.includes('../')
    );
  }

  /**
   * Определение Content-Type по расширению файла
   */
  private getContentType(path: string): string {
    const extension = path.split('.').pop()?.toLowerCase() || '';

    const mimeTypes: Record<string, string> = {
      // HTML
      html: 'text/html',
      htm: 'text/html',

      // CSS
      css: 'text/css',

      // JavaScript
      js: 'application/javascript',
      mjs: 'application/javascript',

      // JSON
      json: 'application/json',

      // Images
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      svg: 'image/svg+xml',
      ico: 'image/x-icon',
      webp: 'image/webp',

      // Fonts
      ttf: 'font/ttf',
      otf: 'font/otf',
      woff: 'font/woff',
      woff2: 'font/woff2',

      // Text
      txt: 'text/plain',
      md: 'text/markdown',

      // Archives
      zip: 'application/zip',
      gz: 'application/gzip',

      // PDF
      pdf: 'application/pdf',

      // XML
      xml: 'application/xml',
    };

    return mimeTypes[extension] || 'application/octet-stream';
  }

  /**
   * Получение информации о сервере для отправки клиенту
   */
  public getInfo(): string {
    return `Static HTTP Server on port ${this.port}, serving from ${this.config.path}`;
  }
}
