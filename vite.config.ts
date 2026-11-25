import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages ではリポジトリ名のサブパスで配信されるため BASE_PATH で切り替える
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png', 'favicon.svg'],
      manifest: {
        name: '会話資産',
        short_name: '会話資産',
        description: '誰に何を話したかを記録して、過去の話を見返すアプリ',
        lang: 'ja',
        start_url: base,
        scope: base,
        display: 'standalone',
        background_color: '#f7f5f0',
        theme_color: '#f7f5f0',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        // ホーム画面アイコンの長押しメニュー(Android・PCのChrome/Edge。iPhoneのSafariは未対応)
        shortcuts: [
          {
            name: '新規記録',
            short_name: '新規記録',
            description: '新しい記録をすぐに書き始める',
            url: `${base}#/new`,
            icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }],
          },
        ],
      },
      workbox: { globPatterns: ['**/*.{js,css,html,png,svg,webp}'] },
    }),
  ],
  test: { environment: 'node' },
} as any);
