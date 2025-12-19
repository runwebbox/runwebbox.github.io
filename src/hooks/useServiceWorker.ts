import { useState, useEffect, useCallback, useRef } from 'react';
import { useFileSystem } from './useFileSystem';
import type { FileItem } from '../types/fileSystem';

interface FetchRequest {
  url: string;
  path: string;
  method: string;
  headers: Record<string, string>;
}

interface FetchResponse {
  response: string;
  status?: number;
  headers?: Record<string, string>;
  error?: string;
}

const findFileByPath = (path: string, files: FileItem[]): FileItem | null => {
  for (const file of files) {
    if (file.type === 'file') {
      const filePath = `/${file.name}`;
      if (filePath === path) {
        return file;
      }
    } else if (file.type === 'folder' && file.children) {
      const childPath = path.startsWith('/') ? path.slice(1) : path;
      const pathParts = childPath.split('/');
      const nextPath = pathParts.slice(1).join('/');
      const found = findFileByPath(`/${nextPath}`, file.children);
      if (found) return found;
    }
  }
  return null;
};

export const useServiceWorker = () => {
  const [swRegistration, setSwRegistration] =
    useState<ServiceWorkerRegistration | null>(null);
  const { fileSystem } = useFileSystem();
  const [isReady, setIsReady] = useState(false);

  const requestChannelRef = useRef<BroadcastChannel | null>(null);
  const responseChannelRef = useRef<BroadcastChannel | null>(null);

  // Обработчик запросов от Service Worker
  const handleFetchRequest = useCallback(
    (request: FetchRequest): FetchResponse => {
      try {
        let filePath = request.path;

        // Нормализуем путь
        if (filePath === '/') {
          filePath = '/index.html';
        }

        // Ищем файл в файловой системе
        const file = fileSystem.children
          ? findFileByPath(filePath, fileSystem.children)
          : null;

        if (file && file.content !== undefined) {
          return {
            response: file.content,
            status: 200,
            headers: {
              'Content-Type': getContentType(file.name),
            },
          };
        }

        // Если файл не найден, создаем автоматический index.html
        if (filePath === '/index.html' && fileSystem.children) {
          const autoIndex = generateAutoIndex(fileSystem.children);
          return {
            response: autoIndex,
            status: 200,
            headers: {
              'Content-Type': 'text/html',
            },
          };
        }

        return {
          response: 'File not found',
          status: 404,
          headers: {
            'Content-Type': 'text/plain',
          },
        };
      } catch (error) {
        console.error('Error handling fetch request:', error);
        return {
          response: 'Internal Server Error',
          status: 500,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },
    [fileSystem]
  );

  // Обработка запросов из BroadcastChannel
  const handleRequestMessage = useCallback(
    (event: MessageEvent) => {
      const { type, requestId, payload, clientId } = event.data;

      if (type === 'FETCH_REQUEST') {
        console.log(
          'Received fetch request:',
          requestId,
          'from client:',
          clientId
        );

        // Обрабатываем запрос
        const response = handleFetchRequest(payload);

        // Отправляем ответ через канал ответов
        if (responseChannelRef.current) {
          responseChannelRef.current.postMessage({
            type: 'FETCH_RESPONSE',
            requestId,
            payload: response,
            clientId, // Отправляем обратно тому же клиенту
          });
        }
      }
    },
    [handleFetchRequest]
  );

  // Инициализация BroadcastChannels
  useEffect(() => {
    // Создаем каналы
    const requestChannel = new BroadcastChannel('fetch-requests');
    const responseChannel = new BroadcastChannel('fetch-responses');

    requestChannelRef.current = requestChannel;
    responseChannelRef.current = responseChannel;

    // Настраиваем обработчик запросов
    requestChannel.addEventListener('message', handleRequestMessage);

    setIsReady(true);

    console.log('BroadcastChannels initialized');

    return () => {
      requestChannel.removeEventListener('message', handleRequestMessage);
      requestChannel.close();
      responseChannel.close();
    };
  }, [handleRequestMessage]);

  // Регистрация Service Worker
  useEffect(() => {
    const registerSW = async () => {
      if ('serviceWorker' in navigator) {
        try {
          let registration = await navigator.serviceWorker.getRegistration();

          if (!registration) {
            // Регистрируем новый SW
            const swPath = location.host.includes('localhost')
              ? '/RunWebBox/sw.js'
              : '/sw.js';
            registration = await navigator.serviceWorker.register(swPath, {
              scope: '/',
              updateViaCache: 'none',
            });

            // Ждем активации
            if (registration.installing) {
              await new Promise<void>(resolve => {
                const sw = registration!.installing!;
                sw.addEventListener('statechange', () => {
                  if (sw.state === 'activated') {
                    resolve();
                  }
                });
              });
            }
          } else {
            // Проверяем обновления
            await registration.update();
          }

          setSwRegistration(registration);
        } catch (error) {
          console.error('Service Worker registration failed:', error);
        }
      }
    };

    registerSW();
  }, []);

  return {
    swRegistration,
    isReady,
  };
};

// Вспомогательные функции
function getContentType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  const mimeTypes: Record<string, string> = {
    html: 'text/html',
    htm: 'text/html',
    css: 'text/css',
    js: 'application/javascript',
    json: 'application/json',
    txt: 'text/plain',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    ico: 'image/x-icon',
  };
  return mimeTypes[ext || ''] || 'application/octet-stream';
}

function generateAutoIndex(files: FileItem[]): string {
  const items = files
    .map(file => {
      const icon = file.type === 'folder' ? '📁' : '📄';
      return `<li>${icon} ${file.name}</li>`;
    })
    .join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Index</title>
      <style>
        body { font-family: sans-serif; padding: 20px; }
        ul { list-style: none; padding: 0; }
        li { padding: 5px 0; }
      </style>
    </head>
    <body>
      <h1>Index of files</h1>
      <ul>${items}</ul>
    </body>
    </html>
  `;
}
