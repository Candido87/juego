import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      input: { main: resolve(__dirname, 'index.html'), galeria: resolve(__dirname, 'galeria-torretas.html'), terreno: resolve(__dirname, 'terreno-prueba.html'), vista3d: resolve(__dirname, 'vista3d.html') },
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
