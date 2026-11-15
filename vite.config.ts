import { defineConfig, type Plugin } from 'vite';
import { buildContent } from './scripts/content.ts';

const VID = 'virtual:content-index';

/** Validates content at build time (invalid content fails the build), ships the
 *  index as a virtual module, and emits each topic / practical as its own JSON. */
function content(): Plugin {
  const check = () => {
    const c = buildContent();
    if (c.errors.length) throw new Error(`Invalid content (${c.errors.length}):\n` + c.errors.map((e) => '  - ' + e).join('\n'));
    return c;
  };
  return {
    name: 'zero-lab-content',
    resolveId(id) {
      if (id === VID) return '\0' + VID;
    },
    load(id) {
      if (id === '\0' + VID) return `export default ${JSON.stringify(check().index)};`;
    },
    buildStart() {
      check();
    },
    generateBundle() {
      const c = check();
      for (const [fileName, source] of Object.entries(c.files)) this.emitFile({ type: 'asset', fileName, source });
    },
    configureServer(server) {
      server.watcher.add(['content', 'practicals']);
      server.watcher.on('change', (f) => {
        if (/\/(content|practicals)\//.test(f)) {
          const m = server.moduleGraph.getModuleById('\0' + VID);
          if (m) server.moduleGraph.invalidateModule(m);
          server.ws.send({ type: 'full-reload' });
        }
      });
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0];
        if (url.startsWith('/content/') || url.startsWith('/practicals/')) {
          const c = buildContent();
          const body = c.files[url.slice(1)];
          if (body) {
            res.setHeader('content-type', 'application/json');
            res.end(body);
            return;
          }
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [content()],
  server: {
    host: true,
    port: 5173,
    proxy: { '/api': { target: process.env.API_TARGET ?? 'http://127.0.0.1:8011', changeOrigin: true } },
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'three';
          if (id.includes('node_modules/katex')) return 'katex';
        },
      },
    },
  },
});
