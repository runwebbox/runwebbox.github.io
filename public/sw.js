// Карта ожидающих запросов
const pendingRequests = new Map();

// BroadcastChannel для запросов и ответов
let requestBroadcastChannel = null;
let responseBroadcastChannel = null;

self.addEventListener('install', event => {
  console.log('Service Worker installing');
  self.skipWaiting();
});

function activateBroadcastChannels() {
  // Инициализируем BroadcastChannels при активации
  requestBroadcastChannel = new BroadcastChannel('fetch-requests');
  responseBroadcastChannel = new BroadcastChannel('fetch-responses');

  // Настраиваем обработчик ответов
  responseBroadcastChannel.addEventListener('message', handleResponseMessage);
}

self.addEventListener('activate', event => {
  console.log('Service Worker activating');

  activateBroadcastChannels();

  event.waitUntil(self.clients.claim());
});

const clientToOrigin = new Map(); // clientId -> source URL
const urlToClient = new Map(); // URL -> clientId (для поиска по referrer)

async function determineIframeSource(event) {
  const request = event.request;
  const requestUrl = request.url;
  let referrer = request.referrer || '';
  if (referrer.includes('/editor/index.html')) referrer = '';

  // Получаем clientId из контекста запроса
  const client = await self.clients.get(event.clientId);
  if (!client) return requestUrl;
  const clientId = client ? client.url : requestUrl;
  if (clientId.includes('/editor/index.html'))
    return { source: clientId, isEditor: true };
  // загрузка html
  if (request.mode === 'navigate' || !client || client.url == requestUrl) {
    if (referrer) {
      clientToOrigin.set(requestUrl, clientToOrigin.get(referrer) || referrer);
    }
    if (client && client.url) {
      clientToOrigin.set(
        requestUrl,
        clientToOrigin.get(client.url) || referrer
      );
    }
    const source = clientToOrigin.get(clientId);
    return { source: source || requestUrl, isEditor: false };
    /*
    // 1. Если clientId новый (ещё не встречался)
    if (!clientToOrigin.has(clientId)) {
      // Проверяем, есть ли в urlToClient запись для referrer
      const clientIdFromReferrer = urlToClient.get(referrer);
      
      if (clientIdFromReferrer && clientIdFromReferrer !== clientId) {
        // Нашли! Этот iframe перешёл из другого iframe/окна
        const originalSource = clientToOrigin.get(clientIdFromReferrer);
        if (originalSource) {
          clientToOrigin.set(clientId, originalSource);
          console.log(`iframe[${clientId}] пришёл из: ${originalSource}`);
        } else {
          // Если не нашли исходный источник, используем referrer
          clientToOrigin.set(clientId, referrer || requestUrl);
        }
      } else {
        // Это новый iframe, запоминаем его начальный URL
        clientToOrigin.set(clientId, requestUrl);
        console.log(`Новый iframe[${clientId}] начал с: ${requestUrl}`);
      }
      
      // Обновляем urlToClient для текущего URL
      urlToClient.set(requestUrl, clientId);
    }
    // 2. Если clientId не новый, возвращаем сохранённый источник
    const source = clientToOrigin.get(clientId);
    return source || requestUrl;
    */
  }

  return { source: clientToOrigin.get(clientId) || clientId, isEditor: false };
}

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  const path = url.pathname;

  // Игнорируем запросы к другим доменам
  if (url.origin !== location.origin) {
    return;
  }

  // Игнорируем запросы к /editor и сам service worker
  if (path.startsWith('/editor') || path.includes('sw.js')) {
    return;
  }
  event.respondWith(
    determineIframeSource(event).then(({ source, isEditor }) =>
      isEditor ? fetch(event.request) : handleFetchViaBroadcast(event, source)
    )
  );
});

// Обработчик сообщений с ответами
function handleResponseMessage(event) {
  const { type, requestId, payload } = event.data;

  if (type === 'FETCH_RESPONSE') {
    // Находим pending promise и разрешаем его
    const pendingRequest = pendingRequests.get(requestId);
    if (pendingRequest) {
      pendingRequest(payload);
      pendingRequests.delete(requestId);
    }
  }
}

// Обработка запроса через BroadcastChannel
async function handleFetchViaBroadcast(event, source) {
  if (!requestBroadcastChannel || !responseBroadcastChannel) {
    console.error('BroadcastChannels not initialized');
    activateBroadcastChannels();
    return new Response('Service Worker not ready', { status: 503 });
  }

  const requestId = self.crypto.randomUUID();
  const clientId = source || '';
  //console.log(clientId);

  return new Promise(resolve => {
    let hasResponded = false;
    const responseTimeout = 10000; // 10 секунд

    // Сохраняем callback для разрешения promise
    pendingRequests.set(requestId, response => {
      if (hasResponded) return;
      hasResponded = true;

      const { response: body, status, headers, error } = response;

      if (error) {
        resolve(new Response(error, { status: 500 }));
        return;
      }

      resolve(
        new Response(body, {
          status: status || 200,
          headers: new Headers({
            'Content-Type': 'text/plain',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            ...(headers || {}),
          }),
        })
      );
    });

    // Отправляем широковещательный запрос через BroadcastChannel
    try {
      requestBroadcastChannel.postMessage({
        type: 'FETCH_REQUEST',
        requestId,
        clientId,
        payload: {
          url: event.request.url,
          path: new URL(event.request.url).pathname,
          method: event.request.method,
          headers: Object.fromEntries(event.request.headers.entries()),
        },
      });
    } catch (e) {
      console.error('Failed to broadcast request:', e);
      pendingRequests.delete(requestId);
      resolve(new Response('Failed to broadcast request', { status: 500 }));
      return;
    }

    // Таймаут на случай если ответ не придет
    const timeoutId = setTimeout(() => {
      if (!hasResponded && pendingRequests.has(requestId)) {
        pendingRequests.delete(requestId);
        hasResponded = true;

        resolve(new Response('Request timeout', { status: 504 }));
      }
    }, responseTimeout);

    // Очистка таймаута при ответе
    const originalHandler = pendingRequests.get(requestId);
    pendingRequests.set(requestId, response => {
      clearTimeout(timeoutId);
      if (originalHandler) {
        originalHandler(response);
      }
    });
  });
}

// Периодическая очистка зависших запросов
setInterval(() => {
  const now = Date.now();
  for (const [requestId, timestamp] of Array.from(pendingRequests.entries())) {
    // Если запрос висит больше 30 секунд, очищаем его
    if (now - timestamp > 30000) {
      pendingRequests.delete(requestId);
      console.log('Cleaned up stale request:', requestId);
    }
  }
}, 30000);
