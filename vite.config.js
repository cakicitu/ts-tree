import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
// APP_BASE lets the build be served under a sub-path, e.g. APP_BASE=/ts-tree/.
export default defineConfig({ base: process.env.APP_BASE || '/', plugins: [vue()], server: { proxy: { '/api': 'http://127.0.0.1:3000' } } });
