import { Application, Container, Graphics } from "pixi.js";
import { Client, Room } from "colyseus.js";
import {
  InputMessage,
  MSG_INPUT,
  PLAYER_RADIUS,
  RAID_ROOM,
  SERVER_PORT,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from "@fellowship/shared";

const hud = document.getElementById("hud")!;

// ── PixiJS 초기화 ───────────────────────────────────────────
const app = new Application();
await app.init({
  width: WORLD_WIDTH,
  height: WORLD_HEIGHT,
  background: "#1b1f2a",
  antialias: true,
});
document.getElementById("game")!.appendChild(app.canvas);

// ── 서버 접속 ───────────────────────────────────────────────
const client = new Client(`ws://${location.hostname}:${SERVER_PORT}`);
let room: Room;
try {
  room = await client.joinOrCreate(RAID_ROOM);
  hud.textContent = "접속 완료! WASD 또는 방향키로 이동  ·  다른 탭을 열어보세요";
} catch (err) {
  hud.textContent = "❌ 서버 접속 실패 — 서버가 켜져 있나요?";
  throw err;
}

// ── 플레이어 렌더링 ─────────────────────────────────────────
interface Rendered {
  gfx: Graphics;
  targetX: number;
  targetY: number;
}
const rendered = new Map<string, Rendered>();

function makePlayerGfx(color: string, isSelf: boolean): Graphics {
  const g = new Graphics().circle(0, 0, PLAYER_RADIUS).fill(color);
  if (isSelf) g.circle(0, 0, PLAYER_RADIUS + 4).stroke({ width: 2, color: "#ffffff" });
  return g;
}

room.state.players.onAdd((player: any, sessionId: string) => {
  const isSelf = sessionId === room.sessionId;
  const gfx = makePlayerGfx(player.color, isSelf);
  gfx.position.set(player.x, player.y);
  app.stage.addChild(gfx);
  rendered.set(sessionId, { gfx, targetX: player.x, targetY: player.y });

  // 서버가 위치를 갱신할 때마다 목표 좌표만 갱신 (렌더는 보간)
  player.onChange(() => {
    const r = rendered.get(sessionId);
    if (r) {
      r.targetX = player.x;
      r.targetY = player.y;
    }
  });
});

room.state.players.onRemove((_player: any, sessionId: string) => {
  const r = rendered.get(sessionId);
  if (r) {
    app.stage.removeChild(r.gfx);
    r.gfx.destroy();
    rendered.delete(sessionId);
  }
});

// ── 입력 처리 ───────────────────────────────────────────────
const keys = new Set<string>();
window.addEventListener("keydown", (e) => keys.add(e.key.toLowerCase()));
window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));

let seq = 0;
let lastSent = "";
function sendInput() {
  const input: InputMessage = {
    up: keys.has("w") || keys.has("arrowup"),
    down: keys.has("s") || keys.has("arrowdown"),
    left: keys.has("a") || keys.has("arrowleft"),
    right: keys.has("d") || keys.has("arrowright"),
    seq: seq++,
  };
  // 입력이 바뀔 때만 전송 (대역폭 절약)
  const sig = `${input.up}${input.down}${input.left}${input.right}`;
  if (sig !== lastSent) {
    room.send(MSG_INPUT, input);
    lastSent = sig;
  }
}

// ── 렌더 루프 (보간) ────────────────────────────────────────
app.ticker.add((ticker) => {
  sendInput();
  const dt = ticker.deltaMS / 1000;
  const smooth = Math.min(1, dt * 15); // 부드러운 따라가기
  rendered.forEach((r) => {
    r.gfx.x += (r.targetX - r.gfx.x) * smooth;
    r.gfx.y += (r.targetY - r.gfx.y) * smooth;
  });
});
