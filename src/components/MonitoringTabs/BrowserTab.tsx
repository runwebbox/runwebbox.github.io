// BrowserPreview.tsx
import React, { useRef, useState, useMemo } from 'react';
import useEngine from '../../hooks/useEngine';
import type { browserConfig } from '../../types/webBoxConfig';

interface BrowserPreviewProps {
  machineId: number;
}

const BrowserPreview: React.FC<BrowserPreviewProps> = ({ machineId }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const engine = useEngine();
  const machine = useMemo(
    () => engine.getConfig().machines.find(m => m.id === machineId),
    [engine, machineId]
  ) as browserConfig;
  const [url, setUrl] = useState(machine.url);
  const getMacPath = (path: string) =>
    `/${path + (path.includes('?') ? '&' : '?') + machine.mac}&t=${(+new Date()).toString(36)}`;
  const [iframeUrl, setIframeUrl] = useState(() => {
    const domain = url.match(/^http:\/\/(.*?)\/(.*)$/);
    if (!domain) {
      return 'about:blank';
    }
    engine.sendEventToMachine(machineId, 'update_domain', domain[1]);
    setIsLoading(true);
    return getMacPath(domain[2]);
  });

  const handleRefresh = () => {
    const domain = url.match(/^http:\/\/(.*?)\/(.*)$/);
    if (!domain) {
      alert('url not parsed');
      return;
    }
    engine.sendEventToMachine(machineId, 'update_domain', domain[1]);
    setIsLoading(true);
    // Принудительное обновление с уникальным параметром чтобы избежать кеширования
    setIframeUrl(getMacPath(domain[2]));
  };

  return (
    <div className="h-full flex flex-col">
      <div className="bg-zinc-800 px-4 py-2 border-b border-zinc-700 flex justify-between items-center">
        <input
          type="text"
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder={`URL`}
          className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          className="px-3 py-1 bg-zinc-700 rounded text-sm hover:bg-zinc-600 disabled:opacity-50 m-1"
          onClick={handleRefresh}
        >
          {isLoading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      <div className="flex-1 bg-white relative">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-80 z-10">
            <div className="text-zinc-500">Loading preview...</div>
          </div>
        )}
        <iframe
          ref={iframeRef}
          src={iframeUrl}
          className="w-full h-full border-0"
          title="Browser Preview"
          onLoad={() => {
            setIsLoading(false);
          }}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
        />
      </div>
    </div>
  );
};

export default BrowserPreview;
