import { defineConfig } from 'orval'

export default defineConfig({
  secureShip: {
    input: {
      target: 'http://localhost:8000/openapi.json',
    },
    output: {
      target: 'src/api/generated/secure-ship.ts',
      client: 'react-query',
      httpClient: 'fetch',
      baseUrl: 'http://localhost:8000',
      clean: true,
    },
  },
})
