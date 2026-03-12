import React, { useState, useRef, useEffect } from 'react';

const NpmInBrowserDemo: React.FC = () => {
  const [command, setCommand] = useState('install --no-audit');
  const [output, setOutput] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const workerRef = useRef<Worker | null>(null);

  const runNpmCommand = () => {
    if (!command.trim() || isRunning) return;

    // Завершаем предыдущего воркера, если есть
    if (workerRef.current) {
      workerRef.current.terminate();
    }

    // Разбиваем команду на аргументы (простой вариант)
    const args = command.trim().split(/\s+/);

    setOutput([]);
    setIsRunning(true);
    debugger;

    // Создаём нового воркера
    const worker = new Worker(true?new URL('../engine/addons/npm/npm.worker.ts?SW_URL_MAGIC=SWmag_UtXQRshi4lIWtM9d', import.meta.url) :'', {
      type: 'module',
    });

    worker.onmessage = (event) => {
      const data = event.data;
      switch (data.type) {
        case 'stdout':
        case 'stderr':
          setOutput((prev) => [...prev, `[${data.type}] ${data.data}`]);
          break;
        case 'timing-start':
          console.time(data.name);
          break;
        case 'timing-end':
          console.timeEnd(data.name);
          break;
        case 'done':
          setOutput((prev) => [...prev, `✅ Установка завершена. result содержит: ${Object.keys(data.result).join('\n')}\n\n${JSON.stringify(data.post_install,null,'  ')}`]);
          setIsRunning(false);
          worker.terminate();
          workerRef.current = null;
          break;
        case 'error':
          setOutput((prev) => [...prev, `❌ Ошибка: ${data.error}`]);
          setIsRunning(false);
          worker.terminate();
          workerRef.current = null;
          break;
      }
    };

    worker.onerror = (error) => {
        console.log(error);
      setOutput((prev) => [...prev, `⚠️ Ошибка воркера: ${error.message}`]);
      setIsRunning(false);
      workerRef.current = null;
    };

    workerRef.current = worker;

    // Отправляем команду в воркер
    worker.postMessage({
      command: args,
      cwd: '/home/web/app', // можно сделать настраиваемым
        files: {
        'package.json': JSON.stringify({
  "name": "vite-react-typescript-starter",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "eslint .",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^19.2.4",
    "react-dom": "^19.2.4"
  },
  "devDependencies": {
    "@eslint/js": "^9.39.2",
    "@types/node": "^24.10.12",
    "@types/react": "^19.2.13",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "^5.1.3",
    "eslint": "^9.39.2",
    "eslint-plugin-react-hooks": "^7.0.1",
    "eslint-plugin-react-refresh": "^0.5.0",
    "globals": "^17.3.0",
    "typescript": "~5.9.3",
    "typescript-eslint": "^8.54.0",
    "vite": "^7.3.1"
  }
}, null, 2),
        // можно добавить и другие файлы, например README.md
        'README.md': '# My App\nThis is a test.',
        },
    });
  };

  // При размонтировании убиваем воркер
  useEffect(() => {
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
      }
    };
  }, []);

  return (
    <div style={{ padding: '20px' }}>
      <h1>npm в браузере</h1>
      <div>
        <input
          type="text"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          disabled={isRunning}
          placeholder="например: install react"
          style={{ width: '300px', marginRight: '8px' }}
        />
        <button onClick={runNpmCommand} disabled={isRunning}>
          {isRunning ? 'Выполняется...' : 'Запустить npm'}
        </button>
      </div>
      <pre
        style={{
          background: '#1e1e1e',
          color: '#d4d4d4',
          padding: '16px',
          borderRadius: '8px',
          marginTop: '20px',
          height: '400px',
          overflow: 'auto',
        }}
      >
        {output.map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </pre>
    </div>
  );
};

export default NpmInBrowserDemo;