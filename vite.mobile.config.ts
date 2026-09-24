export default defineConfig(() => {
  const buildTimestamp = new Date().toISOString();

  return {
    base: '/attendant/',   // <-- add this line: portal is served at /attendant, not site root
    plugins: [react(), tailwindcss()],
    define: {
      __BUILD_TIMESTAMP__: JSON.stringify(buildTimestamp),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      outDir: 'dist-mobile',
      rollupOptions: {
        input: path.resolve(__dirname, 'mobile.html'),
      },
    },
  };
});
