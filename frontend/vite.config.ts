import react from '@vitejs/plugin-react'
import { defineConfig, type ViteDevServer } from 'vite'

// プラグインとしてミドルウェアを定義
const pnaMiddleware = () => ({
  name: 'pna-middleware',
  configureServer(server: ViteDevServer) {
    server.middlewares.use((req, res, next) => {
      // Private Network Access 用のヘッダーをすべてのレスポンスに追加
      res.setHeader('Access-Control-Allow-Private-Network', 'true')
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

      // OPTIONS プリフライトリクエストに即座に応答
      if (req.method === 'OPTIONS') {
        res.statusCode = 204
        res.end()
        return
      }

      next()
    })
  },
})

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), pnaMiddleware()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: ['yoineko-storage.local'],
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
    headers: {
      // Private Network Access (PNA) 対応
      // .local ドメイン経由のアクセスを許可するために必要
      'Access-Control-Allow-Private-Network': 'true',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
    // PNA のプリフライトリクエストを明示的に処理
    middlewareMode: false,
  },
})