import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 5173,
    host: true, // 같은 네트워크의 친구들이 접속 테스트 가능
  },
  build: {
    target: "esnext", // top-level await 지원
  },
});
