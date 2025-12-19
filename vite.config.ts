import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [tailwindcss(), react()],
  optimizeDeps: {
    exclude: ['v86'],
  },
  base: './',
  server: {
    open: '/editor/index.html',
    headers: {
      'Service-Worker-Allowed': '/',
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        editor: 'editor/index.html',
        loader: 'src/webBoxLoader/loader.ts',
      },
      output: {
        entryFileNames: chunkInfo => {
          // Для внешнего скрипта задаем фиксированное имя
          if (chunkInfo.name === 'loader') {
            return 'external-script.js';
          }
          return 'assets/[name]-[hash].js';
        },
      },
    },
  },
});
