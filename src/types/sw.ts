// Типы для сообщений BroadcastChannel
export interface FetchRequestMessagePayload {
  url: string;
  path: string;
  method: string;
  headers: Record<string, string>;
}

export interface FetchRequestMessage {
  type: 'FETCH_REQUEST';
  requestId: string;
  clientId: string;
  payload: FetchRequestMessagePayload;
}

export interface FetchResponseMessage {
  type: 'FETCH_RESPONSE';
  requestId: string;
  payload: {
    response?: string | ArrayBuffer | Blob | FormData | ReadableStream;
    status?: number;
    headers?: Record<string, string>;
    error?: string;
  };
}

export type BroadcastMessage = FetchRequestMessage | FetchResponseMessage;

// Тип для pending запросов
export type PendingRequestCallback = (
  response: FetchResponseMessage['payload']
) => void;

// Тип для маппинга клиентов
export type ClientOriginMapping = Map<string, string>;

// Тип для результата определения источника iframe
export interface IframeSourceResult {
  source: string;
  isEditor: boolean;
}

// Константы
export const SW_URL_MAGIC = 'SWmag_UtXQRshi4lIWtM9d';
