import React, { useState, useEffect } from 'react';
import useEngine from '../hooks/useEngine';
import type { EngineEvent, EngineStatus } from '../engine/log';

export const EngineControl: React.FC = () => {
  const engine = useEngine();
  const [status, setStatus] = useState<EngineStatus>(() => engine.getStatus());

  useEffect(() => {
    const handleStatusUpdate = (event: EngineEvent) => {
      if (event.type === 'status_update') {
        setStatus(event.data);
      }
    };

    engine.addEventListener(handleStatusUpdate);

    return () => {
      engine.removeEventListener(handleStatusUpdate);
    };
  }, [engine]);

  const handleStart = async () => {
    if (['stopped', 'error'].includes(status)) {
      try {
        await engine.start();
      } catch (error) {
        console.error('Failed to start engine:', error);
      }
    }
  };

  const handleStop = async () => {
    if (status === 'running') {
      try {
        await engine.stop();
      } catch (error) {
        console.error('Failed to stop engine:', error);
      }
    }
  };

  const getStatusData = () => {
    const baseData = {
      backgroundColor: 'bg-zinc-800',
      text: status,
      color: 'text-zinc-400',
      char: '—',
      title: '',
      buttonBackground: 'bg-zinc-800',
      showButton: false,
      buttonAction: () => {},
    };

    const statusMap = {
      running: {
        text: 'Запущен',
        color: 'text-green-400',
        char: '⏹',
        title: 'Остановить движок',
        buttonBackground: 'bg-rose-700 hover:bg-rose-600',
        showButton: true,
        buttonAction: handleStop,
      },
      starting: {
        text: 'Запускается',
        color: 'text-yellow-400',
      },
      stopping: {
        text: 'Останавливается',
        color: 'text-yellow-400',
      },
      stopped: {
        text: 'Остановлен',
        color: 'text-red-400',
        char: '▶',
        title: 'Запустить движок',
        buttonBackground: 'bg-emerald-700 hover:bg-emerald-600',
        showButton: true,
        buttonAction: handleStart,
      },
      error: {
        text: 'Ошибка',
        color: 'text-red-400',
        char: '▶',
        title: 'Запустить движок',
        buttonBackground: 'bg-emerald-700 hover:bg-emerald-600',
        showButton: true,
        buttonAction: handleStart,
      },
    };

    return { ...baseData, ...statusMap[status] };
  };

  const statusData = getStatusData();

  return (
    <div className="flex items-center h-[22px] text-sm flex-shrink-0 border-t border-zinc-700 bg-zinc-800 m-[10px] rounded-md justify-between">
      <div
        className={`px-3 py-1 h-[22px] flex items-center justify-center rounded-l-md ${statusData.backgroundColor} ${statusData.color}`}
      >
        <span className="truncate">{statusData.text}</span>
      </div>

      {statusData.showButton ? (
        <button
          onClick={statusData.buttonAction}
          className={`px-3 py-1 h-[22px] flex items-center justify-center rounded-r-md text-white transition-colors ${statusData.buttonBackground}`}
          title={statusData.title}
        >
          {statusData.char}
        </button>
      ) : (
        <div className="px-3 py-1 h-[22px] flex items-center justify-center rounded-r-md bg-zinc-800 border-l border-zinc-700 text-zinc-500">
          <span className="truncate">{statusData.char}</span>
        </div>
      )}
    </div>
  );
};
