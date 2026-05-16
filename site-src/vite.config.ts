import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'serve-root-assets',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const url = req.originalUrl || req.url;
          if (!url) return next();

          const pathname = new URL(url, 'http://localhost').pathname;
          if (!pathname.startsWith('/')) return next();

          // Let Vite handle its own internals and app source files.
          if (pathname === '/' || pathname.startsWith('/@vite') || pathname.startsWith('/@id') || pathname.startsWith('/node_modules') || pathname.startsWith('/site-src/')) {
            return next();
          }

          const filePath = path.resolve(__dirname, '..', pathname.slice(1));
          try {
            if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
              const ext = path.extname(filePath).toLowerCase();
              const mimeTypes: Record<string, string> = {
                '.png': 'image/png',
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.gif': 'image/gif',
                '.svg': 'image/svg+xml',
                '.json': 'application/json',
                '.webp': 'image/webp',
                '.mp4': 'video/mp4',
                '.webm': 'video/webm',
                '.mov': 'video/quicktime',
                '.mp3': 'audio/mpeg',
                '.wav': 'audio/wav',
                '.ogg': 'audio/ogg',
                '.m4a': 'audio/mp4',
                '.css': 'text/css',
                '.js': 'text/javascript',
                '.mjs': 'text/javascript',
                '.txt': 'text/plain',
              };
              res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
              fs.createReadStream(filePath).pipe(res);
              return;
            }
          } catch (e) {
            console.error('Error serving asset:', e);
          }
          next();
        });
      }
    }
  ],
  server: {
      fs: {
          allow: ['..']
      }
  },
  build: {
    outDir: '../', // Build to repository root
    emptyOutDir: false, // CRITICAL: Do not delete existing files in root (images, etc)
    rollupOptions: {
        output: {
            entryFileNames: 'dist/[name].js',
            chunkFileNames: 'dist/[name].js',
            assetFileNames: 'dist/[name].[ext]'
        }
    }
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
