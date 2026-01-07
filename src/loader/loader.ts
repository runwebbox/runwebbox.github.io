import type { ProgressCallback } from './types';
import GithubLoader from './loaders/github';
import { exportWebBox } from './normalize';
import ContentLoader from './loaders/content';
import { Engine } from '../engine/engine';
import type { FSEntry } from '../engine/fileSystem';

const initialFileSystem: FSEntry = {
  name: 'project',
  content: [
    {
      name: 'webbox.json',
      content: new TextEncoder().encode('{}'),
    },
    {
      name: 'index.html',
      content: new TextEncoder().encode(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Counter Clicker</title>
    <link rel="stylesheet" href="styles/style.css">
</head>
<body>
    <div class="container">
        <h1>Counter Clicker</h1>
        
        <div class="counter-display">
            <span id="counter-value">0</span>
        </div>
        
        <div class="buttons">
            <button id="increment-btn" class="btn btn-primary">+</button>
            <button id="decrement-btn" class="btn btn-secondary">-</button>
            <button id="reset-btn" class="btn btn-danger">Reset</button>
        </div>
        
        <div class="location-info">
            <h3>Location Information</h3>
            <div id="location-display">
                <p><strong>URL:</strong> <span id="current-url"></span></p>
                <p><strong>Path:</strong> <span id="current-path"></span></p>
                <p><strong>Host:</strong> <span id="current-host"></span></p>
                <p><strong>Protocol:</strong> <span id="current-protocol"></span></p>
            </div>
        </div>
        
        <div class="counter-history">
            <h3>Counter History</h3>
            <div id="history-list"></div>
        </div>
    </div>

    <script src="app.js"></script>
</body>
</html>`),
    },
    {
      name: 'app.js',
      content: new TextEncoder().encode(`class Counter {
    constructor() {
        this.count = this.getCountFromUrl();
        this.history = [];
        this.init();
    }

    init() {
        this.bindEvents();
        this.updateDisplay();
        this.displayLocation();
        this.setupHistory();
    }

    bindEvents() {
        document.getElementById('increment-btn').addEventListener('click', () => {
            this.increment();
        });

        document.getElementById('decrement-btn').addEventListener('click', () => {
            this.decrement();
        });

        document.getElementById('reset-btn').addEventListener('click', () => {
            this.reset();
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === '+' || e.key === '=') {
                this.increment();
            } else if (e.key === '-' || e.key === '_') {
                this.decrement();
            } else if (e.key === 'r' || e.key === 'R') {
                this.reset();
            }
        });
    }

    getCountFromUrl() {
        const urlParams = new URLSearchParams(window.location.search);
        const countParam = urlParams.get('count');
        return countParam ? parseInt(countParam, 10) : 0;
    }

    updateUrl(count) {
        const url = new URL(window.location);
        url.searchParams.set('count', count);
        window.location.href = url.toString(); // Перезагружаем страницу с новым URL
    }

    increment() {
        const newCount = this.count + 1;
        this.addToHistory('increment', this.count);
        this.updateUrl(newCount);
    }

    decrement() {
        const newCount = this.count - 1;
        this.addToHistory('decrement', this.count);
        this.updateUrl(newCount);
    }

    reset() {
        this.addToHistory('reset', this.count);
        this.updateUrl(0);
    }

    setupHistory() {
        // История теперь будет храниться в sessionStorage (поскольку страница перезагружается)
        const sessionHistory = sessionStorage.getItem('counterHistory');
        this.history = sessionHistory ? JSON.parse(sessionHistory) : [];
        
        // Добавляем текущее состояние в историю
        const currentAction = {
            action: 'init',
            description: \`Initialized with \${this.count}\`,
            timestamp: new Date().toLocaleTimeString(),
            value: this.count
        };
        
        this.history.unshift(currentAction);
        this.updateSessionHistory();
        this.updateHistoryDisplay();
    }

    addToHistory(action, previousValue = null) {
        const timestamp = new Date().toLocaleTimeString();
        let description = '';
        let newValue;
        
        switch(action) {
            case 'increment':
                newValue = previousValue + 1;
                description = \`Increased from \${previousValue} to \${newValue}\`;
                break;
            case 'decrement':
                newValue = previousValue - 1;
                description = \`Decreased from \${previousValue} to \${newValue}\`;
                break;
            case 'reset':
                description = \`Reset from \${previousValue} to 0\`;
                newValue = 0;
                break;
        }

        const historyItem = {
            action,
            description,
            timestamp,
            value: newValue,
            url: window.location.href
        };

        // Добавляем в sessionStorage
        const sessionHistory = sessionStorage.getItem('counterHistory');
        const history = sessionHistory ? JSON.parse(sessionHistory) : [];
        history.unshift(historyItem);
        
        // Сохраняем только последние 10 записей
        if (history.length > 10) {
            history.splice(10);
        }
        
        sessionStorage.setItem('counterHistory', JSON.stringify(history));
    }

    updateSessionHistory() {
        const sessionHistory = sessionStorage.getItem('counterHistory');
        const history = sessionHistory ? JSON.parse(sessionHistory) : [];
        
        // Сохраняем только последние 10 записей
        if (history.length > 10) {
            history.splice(10);
        }
        
        sessionStorage.setItem('counterHistory', JSON.stringify(history));
    }

    updateDisplay() {
        const counterElement = document.getElementById('counter-value');
        counterElement.textContent = this.count;
        
        // Add animation
        counterElement.style.transform = 'scale(1.1)';
        setTimeout(() => {
            counterElement.style.transform = 'scale(1)';
        }, 150);
    }

    updateHistoryDisplay() {
        const historyList = document.getElementById('history-list');
        historyList.innerHTML = '';

        this.history.forEach(item => {
            const historyItem = document.createElement('div');
            historyItem.className = 'history-item ' + (item.action || '');
            historyItem.innerHTML = \`
                <strong>\${item.timestamp}</strong>: \${item.description}
                \${item.url ? \`<br><small>URL: \${item.url}</small>\` : ''}
            \`;
            historyList.appendChild(historyItem);
        });
    }

    displayLocation() {
        document.getElementById('current-url').textContent = window.location.href;
        document.getElementById('current-path').textContent = window.location.pathname;
        document.getElementById('current-host').textContent = window.location.host;
        document.getElementById('current-protocol').textContent = window.location.protocol;
    }
}

// Initialize the counter when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new Counter();
});

// Обновляем информацию об URL при изменении истории (back/forward)
window.addEventListener('popstate', () => {
    // При использовании back/forward страница автоматически перезагрузится
    // с новым URL, но обновим отображение
    const counter = new Counter();
    counter.displayLocation();
});`),
    },
    {
      name: 'styles',
      content: [
        {
          name: 'style.css',
          content: new TextEncoder().encode(`* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    min-height: 100vh;
    padding: 20px;
}

.container {
    max-width: 600px;
    margin: 0 auto;
    background: white;
    border-radius: 15px;
    padding: 30px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
}

h1 {
    text-align: center;
    color: #333;
    margin-bottom: 30px;
    font-size: 2.5em;
}

.counter-display {
    text-align: center;
    margin: 30px 0;
}

#counter-value {
    font-size: 4em;
    font-weight: bold;
    color: #667eea;
    text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.1);
}

.buttons {
    display: flex;
    justify-content: center;
    gap: 15px;
    margin: 30px 0;
}

.btn {
    padding: 12px 24px;
    font-size: 1.2em;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.3s ease;
    font-weight: bold;
}

.btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 5px 15px rgba(0, 0, 0, 0.2);
}

.btn-primary {
    background-color: #4CAF50;
    color: white;
}

.btn-secondary {
    background-color: #2196F3;
    color: white;
}

.btn-danger {
    background-color: #f44336;
    color: white;
}

.location-info, .counter-history {
    margin-top: 30px;
    padding: 20px;
    background: #f8f9fa;
    border-radius: 10px;
    border-left: 4px solid #667eea;
}

.location-info h3, .counter-history h3 {
    color: #333;
    margin-bottom: 15px;
}

#location-display p {
    margin: 8px 0;
    font-size: 0.95em;
}

#location-display strong {
    color: #555;
    min-width: 80px;
    display: inline-block;
}

#history-list {
    max-height: 150px;
    overflow-y: auto;
}

.history-item {
    padding: 8px 12px;
    margin: 5px 0;
    background: white;
    border-radius: 5px;
    border-left: 3px solid #4CAF50;
    font-size: 0.9em;
}

.history-item.decrement {
    border-left-color: #f44336;
}

.history-item.reset {
    border-left-color: #ff9800;
}

/* Responsive design */
@media (max-width: 600px) {
    .container {
        padding: 20px;
        margin: 10px;
    }
    
    h1 {
        font-size: 2em;
    }
    
    #counter-value {
        font-size: 3em;
    }
    
    .buttons {
        flex-direction: column;
        align-items: center;
    }
    
    .btn {
        width: 100%;
        max-width: 200px;
    }
}`),
        },
      ],
    },
  ],
};

export async function loadWebBox(
  url: URL,
  onProgress: ProgressCallback
): Promise<Engine> {
  try {
    const fs = await parseUrl(url, onProgress);
    const conf = exportWebBox(fs);
    //if (url.searchParams.has('diff')) {
    //}t
    const engine = new Engine(conf);
    return engine;
  } catch (error) {
    let errorMessage = 'Failed to do something exceptional';
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    onProgress({ message: `Error: ${errorMessage}`, percent: 100 });
    const engine = new Engine(exportWebBox(initialFileSystem));
    return engine;
  }
}

async function parseUrl(
  url: URL,
  onProgress: ProgressCallback
): Promise<FSEntry> {
  let conf: FSEntry | null = null;
  // GitHub loader
  if (url.searchParams.has('github')) {
    conf = await new GithubLoader(
      {
        type: 'github',
        url: url.searchParams.get('github')!,
      },
      onProgress
    ).load();
  }
  // Content loader
  if (url.searchParams.has('content')) {
    conf = await new ContentLoader(
      {
        type: 'content',
        data: url.searchParams.get('content')!,
      },
      onProgress
    ).load();
  }

  if (!conf) {
    throw new Error('No data to load');
  }

  return conf;
}
