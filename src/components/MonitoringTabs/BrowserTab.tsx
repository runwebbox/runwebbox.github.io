// BrowserPreview.tsx
import React, { useRef, useState, useEffect } from 'react';
import useEngine from '../../hooks/useEngine';

interface BrowserPreviewProps {
  machineId: number;
}

const BrowserPreview: React.FC<BrowserPreviewProps> = ({ machineId }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [url, setUrl] = useState('/');
  const engine = useEngine();

  // Получаем URL из конфигурации браузера
  useEffect(() => {
    const config = engine.getConfig();
    const machine = config.machines.find(m => m.id === machineId);

    if (machine && machine.type === 'browser') {
      setUrl('/?mac='+machine.mac);
    }
  }, [engine, machineId]);

  const handleRefresh = () => {
    if (iframeRef.current) {
      setIsLoading(true);
      // Принудительное обновление с уникальным параметром чтобы избежать кеширования
      iframeRef.current.src = `${url}&t=${Date.now()}`;
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="bg-zinc-800 px-4 py-2 border-b border-zinc-700 flex justify-between items-center">
        <h3 className="font-medium">Browser Preview</h3>
        <div className="flex items-center space-x-3">
          <div className="text-sm text-gray-400 truncate max-w-xs">{url}</div>
          <button
            className="px-3 py-1 bg-zinc-700 rounded text-sm hover:bg-zinc-600 disabled:opacity-50"
            onClick={handleRefresh}
            disabled={isLoading}
          >
            {isLoading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="flex-1 bg-white relative">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-80 z-10">
            <div className="text-zinc-500">Loading preview...</div>
          </div>
        )}
        <iframe
          ref={iframeRef}
          src={url}
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
