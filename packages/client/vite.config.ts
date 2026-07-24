import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 5273,
    strictPort: true, // 포트가 막혀 있으면 조용히 다른 포트로 넘어가지 않고 실패
    host: true, // 같은 네트워크의 친구들이 접속 테스트 가능
  },
  build: {
    target: "esnext", // top-level await 지원
  },
});
