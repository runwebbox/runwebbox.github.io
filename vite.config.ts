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
    open: '/editor/index.html?SW_URL_MAGIC=SWmag_UtXQRshi4lIWtM9d',
    headers: {
      'Service-Worker-Allowed': '/',
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        editor: 'editor/index.html',
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
