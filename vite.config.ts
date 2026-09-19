import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createApi } from './server/api.js';
export default defineConfig({plugins:[react(),{name:'local-model-api',configureServer(server){server.middlewares.use(createApi());}}]});
