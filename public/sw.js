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
const SW_URL_MAGIC = 'SWmag_UtXQRshi4lIWtM9d';

/**
 * Определяет источник для iframe на основе запроса и контекста клиента
 * @param {FetchEvent} event - Событие fetch
 * @returns {Promise<{source: string, isEditor: boolean}>} - Объект с источником и флагом редактора
 */
async function determineIframeSource(event) {
  const { request } = event;
  const requestUrl = request.url;

  // Проверяем, является ли клиент редактором
  if (requestUrl.includes(SW_URL_MAGIC)) {
    return { source: requestUrl, isEditor: true };
  }

  // Получаем и очищаем referrer
  const rawReferrer = request.referrer || '';
  const referrer = rawReferrer.includes(SW_URL_MAGIC) ? '' : rawReferrer;

  // Получаем клиента
  const client = await self.clients.get(event.clientId);
  const clientId = event.clientId;

  // Если клиент не найден, возвращаем базовый URL
  if (!client) {
    return { source: requestUrl, isEditor: false };
  }

  const clientUrl = client.url;

  // Проверяем, является ли клиент редактором
  if (clientUrl.includes(SW_URL_MAGIC)) {
    return { source: clientUrl, isEditor: true };
  }

  // Обрабатываем навигационные запросы
  const isNavigationRequest = request.mode === 'navigate'; // first request in site
  const isSameOrigin = clientUrl === requestUrl; // first request in site

  if (isNavigationRequest || isSameOrigin) {
    // clientId и client скорее всего тут будут ещё указывать на прошлого клиента
    // так как при переходе на новую страницу клиент запроашивающий новую страницу ещё старый
    // так что если это не первый зарпос, то clientUrl == referrer
    // по сути переход clientUrl (referrer) -> requestUrl
    updateClientOriginMapping(clientUrl, requestUrl, referrer, client);

    const source =
      clientToOrigin.get(clientId) ||
      clientToOrigin.get(clientUrl) ||
      requestUrl;
    return { source, isEditor: false };
  }

  // Для остальных запросов
  const source =
    clientToOrigin.get(clientId) || clientToOrigin.get(clientUrl) || clientUrl;
  clientToOrigin.set(clientId, source);
  console.log(clientToOrigin.get(clientId));
  return { source, isEditor: false };
}

/**
 * Обновляет маппинг клиент -> источник
 * @param {string} clientUrl - URL клиента
 * @param {string} requestUrl - URL запрашиваемый
 * @param {string} referrer - Referrer запроса
 * @param {Client} client - Объект клиента
 */
function updateClientOriginMapping(clientUrl, requestUrl, referrer, client) {
  // Если есть referrer, используем его источник
  if (referrer) {
    const referrerOrigin = clientToOrigin.get(referrer) || referrer;
    clientToOrigin.set(clientUrl, referrerOrigin);
  }

  // Если у клиента есть URL, используем его источник
  if (client && client.url) {
    const clientOrigin = clientToOrigin.get(client.url) || client.url;
    if (requestUrl !== clientOrigin) {
      clientToOrigin.set(requestUrl, clientOrigin);
    }
  }
}

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  const path = url.pathname;

  // Игнорируем запросы к другим доменам
  if (url.origin !== location.origin) {
    return;
  }

  // Игнорируем запросы к /editor и сам service worker
  if (path.startsWith('/sw.js')) {
    return;
  }

  if (path.includes(SW_URL_MAGIC)) {
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
  console.log(event);
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
