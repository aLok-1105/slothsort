import { defineConfig } from 'vite';

export default defineConfig({
	server: {
		host: '0.0.0.0',
		proxy: {
			'/api': {
				target: process.env.BACKEND_URL || 'http://localhost:3001',
				changeOrigin: true,
			},
		},
	},
});
