import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectRegister: false,
      devOptions: { enabled: true, type: 'module' },
      manifest: {
        name: 'Fluxo — Controle Financeiro',
        short_name: 'Fluxo',
        description: 'Receitas, despesas e limites com freio consciente.',
        lang: 'pt-BR',
        theme_color: '#0f766e',
        background_color: '#0b1220',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
      injectManifest: { globPatterns: ['**/*.{js,css,html,svg}'] },
    }),
  ],
  test: { environment: 'node' },
});
