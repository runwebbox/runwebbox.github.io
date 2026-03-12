import { defineConfig, type Plugin } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import  {  nodePolyfills  }  from  'vite-plugin-node-polyfills'


function myCustomPlugin(): Plugin {
  return {
    name: 'my-custom-plugin',
    configResolved(_config) {
      //console.log('Vite config resolved:', config);
    },
		transform: {
			handler(code, id) {
        if (id.includes('npm-in-browser')) {
          return {
            code: code.replace(/64451:[\S\s]*?{[\S\s]*?}/g, '64451:(m)=>{m.exports.spawn=globalThis.CASTOM_SPAWN;}'),
            map: null
          };
        }
      },
    }
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [nodePolyfills({
      include : [ 'path', 'events', 'stream', 'buffer' ] ,
    }
    ), myCustomPlugin(), tailwindcss(), react()],
  optimizeDeps: {
    exclude: ['v86'],
    esbuildOptions: {
      define: {
        global: 'globalThis',
      },
    },
  },
  base: './',
  server: {
    open: '/editor/index.html?SW_URL_MAGIC=SWmag_UtXQRshi4lIWtM9d',
    headers: {
      'Service-Worker-Allowed': '/',
    },
  },
  worker: {
    format: 'es',
    plugins: ()=>[myCustomPlugin()],
  },
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        editor: 'editor/index.html',
        npm_addon: 'src/engine/addons/npm/npm.worker.ts',
      },
      output: {
        entryFileNames: chunkInfo => {
          if (chunkInfo.name === 'npm_addon') {
            return 'npm_addon.js';
          }
          return 'assets/[name]-[hash].js';
        },
      },
    },
  },
});
