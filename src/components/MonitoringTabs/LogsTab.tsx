import React, { useState, useEffect, useRef, useCallback } from 'react';
import useEngine from '../../hooks/useEngine';
import type { logMessage, EngineEvent } from '../../engine/log';

const LogsTab: React.FC<{ machineId: number; }> = ({ machineId }) => {
  const [inputValue, setInputValue] = useState('');
  const logsEndRef = useRef<HTMLDivElement>(null);

  const engine = useEngine();
  const [logs, setLogs] = useState<logMessage[]>([]);

  useEffect(() => {
    const handleEngineEvent = (event: EngineEvent) => {
      if (event.type === 'message' && event.id === machineId) {
        console.log(event.logs);
        setLogs([...event.logs]);
      }
    }; 
    setLogs(engine.getMachineLogs(machineId) || [{  lvl: 'error',  log: `Machine with id ${machineId} not started` }]);
    engine.addEventListener(handleEngineEvent);

    return () => {
      engine.removeEventListener(handleEngineEvent);
    };
  }, [engine, machineId]);

  // Автоскролл к последнему логу
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const handleSendInput = useCallback(() => {
    if (machineId !== null && inputValue.trim()) {
      try {
        engine.sendEventToMachine(machineId, 'send_input', inputValue.trim());
        setInputValue('');
      } catch (error) {
        console.error('Failed to send input:', error);
      }
    }
  }, [engine, machineId, inputValue]);

  const handleKeyPress = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSendInput();
      }
    },
    [handleSendInput]
  );

  const getLogColor = useCallback((lvl: string) => {
    switch (lvl) {
      case 'error':
        return 'text-red-400';
      case 'warning':
        return 'text-yellow-400';
      case 'info':
        return 'text-blue-400';
      default:
        return 'text-gray-300';
    }
  }, []);

  // Если нет machineId, показываем сообщение
  if (machineId === null) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400">
        No machine selected
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-y-auto bg-zinc-900 p-4 font-mono text-sm">
        {logs.length ? (
          <>
            {logs.map((log, index) => (
              <div key={index} className={`mb-1 ${getLogColor(log.lvl)}`}>
                {log.log}
              </div>
            ))}
            <div ref={logsEndRef} />
          </>
        ) : (
          <div className="text-gray-400 text-center py-4">
            No logs available for this machine
          </div>
        )}
      </div>

      <div className="border-t border-zinc-700 p-4">
        <div className="flex space-x-2">
          <input
            type="text"
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={`Send input to machine ${machineId}...`}
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={machineId === null}
          />
          <button
            onClick={handleSendInput}
            disabled={!inputValue.trim() || machineId === null}
            className="px-4 py-2 bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
};

export default LogsTab;
