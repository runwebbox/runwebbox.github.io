import type { Packet } from '../packet';
import type {
  EventFromMachineFunction,
  EventMapToMachine,
  MachineModule,
} from './MachineModule';
import { TCPParser } from '../TCPParser';
import type { browserConfig } from '../../types/webBoxConfig';
import type {
  FetchRequestMessage,
  FetchRequestMessagePayload,
} from '../../types/sw';
import type { LogLvls } from '../log';

export class BrowserModule implements MachineModule {
  private config: browserConfig;
  private sendPacketCallback: (packet: Packet, port: number) => void;
  private log: (s: string, lvl?: LogLvls) => void;
  private tcpParser: TCPParser;
  private requestChannel: BroadcastChannel;
  private responseChannel: BroadcastChannel;
  private logs: string = '';

  // Хранилище для HTTP-запросов (не для TCP соединений!)
  private httpRequests: Map<
    string,
    {
      requestId: string;
      clientId: string;
      buffer: Uint8Array[];
      contentLength?: number;
      headersReceived: boolean;
      responseHeaders: string;
    }
  > = new Map();

  constructor(
    config: browserConfig,
    sendPacket: (packet: Packet, port: number) => void,
    sendEvent: EventFromMachineFunction
  ) {
    this.config = config;
    this.sendPacketCallback = sendPacket;
    this.log = (log, lvl = 'info') => sendEvent('log', { log, lvl });

    const ipBytes = new Uint8Array(this.config.ip);
    const macBytes = this.parseMAC(this.config.mac);
    const sendPacketBind = this.sendPacketCallback.bind(this);

    // Инициализируем TCPParser - он сам будет управлять соединениями
    this.tcpParser = new TCPParser(
      macBytes,
      ipBytes,
      (packet: Packet) => (console.log(packet),sendPacketBind(packet, 0)),
      [], // Серверные порты (браузер не принимает входящие соединения)
      this.handleIncomingData.bind(this) // Callback для входящих данных
    );

    this.requestChannel = new BroadcastChannel('fetch-requests');
    this.responseChannel = new BroadcastChannel('fetch-responses');
  }

  async start(): Promise<void> {
    this.log('Starting browser module');
    this.requestChannel.addEventListener(
      'message',
      this.handleFetchRequest.bind(this)
    );
  }

  async stop(): Promise<void> {
    this.log('Stopping browser module');
    this.requestChannel.close();
    this.responseChannel.close();
  }

  handlePacket(packet: Packet): void {
    this.tcpParser.handlePacket(packet);
  }

  getLogs(): string {
    return this.logs;
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

  private parseMAC(macString: string): Uint8Array {
    const bytes = new Uint8Array(6);
    const parts = macString.split(':').map(part => parseInt(part, 16));
    bytes.set(parts);
    return bytes;
  }

  private async handleFetchRequest(event: MessageEvent): Promise<void> {
    const { type, requestId, payload, clientId } =
      event.data as FetchRequestMessage;

    if (type !== 'FETCH_REQUEST') return;

    // Проверяем, что запрос предназначен для нашего браузера
    if (!clientId.includes(this.config.mac)) {
      return;
    }

    this.log(`Received fetch request: ${requestId} from client: ${clientId}`);

    try {
      await this.processHTTPRequest(payload, requestId, clientId);
    } catch (error) {
      this.log(`Error processing request ${requestId}: ${error}`);

      this.responseChannel.postMessage({
        type: 'FETCH_RESPONSE',
        requestId,
        payload: {
          response: '',
          error: error instanceof Error ? error.message : String(error),
        },
        clientId,
      });
    }
  }

  private async processHTTPRequest(
    fetchRequest: FetchRequestMessagePayload,
    requestId: string,
    clientId: string
  ): Promise<void> {
    const { url, path, method, headers } = fetchRequest;

    // Определяем удаленный порт (по умолчанию 80 для HTTP)
    let remotePort = 80;
    const urlMatch = this.config.url.match(/:\/(\/)?([^:/]+)(:(\d+))?/);
    if (urlMatch && urlMatch[4]) {
      remotePort = parseInt(urlMatch[4]);
    }

    // Преобразуем целевой IP в Uint8Array
    const remoteIP = new Uint8Array([192, 168, 1, 1]);

    // Создаем HTTP запрос
    const httpRequest = this.buildHTTPRequest(
      method,
      path,
      headers,
      remoteIP.join('.')
    );
    const requestData = new TextEncoder().encode(httpRequest);

    try {
      // 1. Устанавливаем TCP соединение
      const localPort = await this.tcpParser.connect(remoteIP, remotePort);

      this.log(`TCP connection established: local port ${localPort}`);

      // 2. Сохраняем информацию о HTTP-запросе с ключом соединения
      const connectionKey = this.getConnectionKey(
        remoteIP,
        remotePort,
        localPort
      );
      this.httpRequests.set(connectionKey, {
        requestId,
        clientId,
        buffer: [],
        headersReceived: false,
        responseHeaders: '',
        contentLength: undefined,
      });

      // 3. Отправляем HTTP запрос через установленное соединение
      this.tcpParser.send(remoteIP, remotePort, localPort, requestData);

      this.log(`HTTP request ${requestId} sent to ${url}`);
    } catch (error) {
      throw new Error(`Failed to process HTTP request: ${error}`);
    }
  }

  private buildHTTPRequest(
    method: string,
    path: string,
    headers: Record<string, string>,
    host: string
  ): string {
    const defaultHeaders: Record<string, string> = {
      Host: host,
      Connection: 'close',
      'User-Agent': 'BrowserModule/1.0',
      Accept: '*/*',
    };

    const allHeaders = { ...defaultHeaders, ...headers };
    let request = `${method.toUpperCase()} ${path} HTTP/1.1\r\n`;

    for (const [key, value] of Object.entries(allHeaders)) {
      request += `${key}: ${value}\r\n`;
    }

    request += '\r\n';
    return request;
  }

  private handleIncomingData(
    remoteIP: Uint8Array,
    remotePort: number,
    localPort: number,
    data: Uint8Array,
    EOF: boolean
  ): void {
    const connectionKey = this.getConnectionKey(
      remoteIP,
      remotePort,
      localPort
    );
    const httpRequest = this.httpRequests.get(connectionKey);

    if (!httpRequest) {
      // Это может быть ответ на соединение, которое уже было закрыто
      return;
    }

    // Добавляем данные в буфер
    httpRequest.buffer.push(data);

    // Если заголовки еще не получены, пытаемся их распарсить
    if (!httpRequest.headersReceived) {
      const combinedBuffer = this.concatBuffers(httpRequest.buffer);
      const combinedText = new TextDecoder().decode(combinedBuffer);

      const headerEndIndex = combinedText.indexOf('\r\n\r\n');
      if (headerEndIndex !== -1) {
        httpRequest.headersReceived = true;
        httpRequest.responseHeaders = combinedText.substring(0, headerEndIndex);

        const contentLengthMatch = httpRequest.responseHeaders.match(
          /Content-Length:\s*(\d+)/i
        );
        if (contentLengthMatch) {
          httpRequest.contentLength = parseInt(contentLengthMatch[1]);
        }

        const headerBytes = headerEndIndex + 4;
        const bodyData = combinedBuffer.slice(headerBytes);
        httpRequest.buffer = bodyData.length > 0 ? [bodyData] : [];
      }
    }

    // Проверяем, получено ли все тело ответа
    if (httpRequest.headersReceived) {
      const totalLength = httpRequest.buffer.reduce(
        (sum, buf) => sum + buf.length,
        0
      );

      if (
        httpRequest.contentLength !== undefined &&
        totalLength >= httpRequest.contentLength
      ) {
        this.processCompleteResponse(httpRequest, connectionKey);
      } else if (httpRequest.contentLength === undefined && EOF) {
        this.processCompleteResponse(httpRequest, connectionKey);
      }
    }
  }

  private processCompleteResponse(
    httpRequest: {
      requestId: string;
      clientId: string;
      buffer: Uint8Array[];
      contentLength?: number;
      headersReceived: boolean;
      responseHeaders: string;
    },
    connectionKey: string
  ): void {
    const combinedBuffer = this.concatBuffers(httpRequest.buffer);
    const fullResponse = new TextDecoder().decode(combinedBuffer);

    const httpResponse = this.parseHTTPResponse(
      httpRequest.responseHeaders + '\r\n\r\n' + fullResponse
    );

    this.responseChannel.postMessage({
      type: 'FETCH_RESPONSE',
      requestId: httpRequest.requestId,
      payload: httpResponse,
      clientId: httpRequest.clientId,
    });

    this.httpRequests.delete(connectionKey);

    this.log(`Response sent for request ${httpRequest.requestId}`);
  }

  private parseHTTPResponse(rawResponse: string) {
    const lines = rawResponse.split('\r\n');
    const statusLine = lines[0];
    const statusMatch = statusLine.match(/HTTP\/\d\.\d\s+(\d+)/);
    const status = statusMatch ? parseInt(statusMatch[1]) : 500;

    const headers: Record<string, string> = {};
    let i = 1;
    for (; i < lines.length; i++) {
      if (lines[i] === '') break;

      const headerMatch = lines[i].match(/^([^:]+):\s*(.+)$/);
      if (headerMatch) {
        headers[headerMatch[1].trim()] = headerMatch[2].trim();
      }
    }

    const body = lines.slice(i + 1).join('\r\n');

    return {
      response: body,
      status,
      headers,
    };
  }

  private concatBuffers(buffers: Uint8Array[]): Uint8Array {
    const totalLength = buffers.reduce((sum, buf) => sum + buf.length, 0);
    const result = new Uint8Array(totalLength);

    let offset = 0;
    for (const buf of buffers) {
      result.set(buf, offset);
      offset += buf.length;
    }

    return result;
  }

  private getConnectionKey(
    remoteIP: Uint8Array,
    remotePort: number,
    localPort: number
  ): string {
    // Создаем ключ в том же формате, что и TCPParser
    const ipString = `${remoteIP[0]}.${remoteIP[1]}.${remoteIP[2]}.${remoteIP[3]}`;
    return `${ipString}:${remotePort}:${localPort}`;
  }
}

export default BrowserModule;
