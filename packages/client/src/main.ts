import { Application, Container, Graphics, Text } from "pixi.js";
import { Client, Room } from "colyseus.js";
import {
  AimMessage,
  BlastEvent,
  DamageEvent,
  DUMMY_RADIUS,
  EV_BLAST,
  EV_DAMAGE,
  EV_SWING,
  InputMessage,
  MSG_ATTACK,
  MSG_INPUT,
  MSG_SKILL,
  PLAYER_RADIUS,
  RAID_ROOM,
  SERVER_PORT,
  SKILL_RADIUS,
  SwingEvent,
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
app.canvas.addEventListener("contextmenu", (e) => e.preventDefault());

const worldLayer = new Container();
const fxLayer = new Container();
app.stage.addChild(worldLayer, fxLayer);

// ── 하단 상태 바 (HP / 마나 / 스킬) ─────────────────────────
const statusBar = document.createElement("div");
statusBar.style.cssText =
  "display:flex;gap:16px;align-items:center;font-size:13px;width:800px;justify-content:center";
statusBar.innerHTML = `
  <span>HP <b id="hp-val">100</b></span>
  <div style="width:180px;height:12px;background:#333;border-radius:6px;overflow:hidden">
    <div id="hp-bar" style="height:100%;width:100%;background:#4ade80"></div>
  </div>
  <span>MP <b id="mp-val">100</b></span>
  <div style="width:180px;height:12px;background:#333;border-radius:6px;overflow:hidden">
    <div id="mp-bar" style="height:100%;width:100%;background:#60a5fa"></div>
  </div>
  <span id="skill-state" style="min-width:120px">스킬(Q): <b style="color:#4ade80">준비됨</b></span>
`;
document.body.appendChild(statusBar);
const hpVal = document.getElementById("hp-val")!;
const hpBar = document.getElementById("hp-bar")! as HTMLElement;
const mpVal = document.getElementById("mp-val")!;
const mpBar = document.getElementById("mp-bar")! as HTMLElement;
const skillState = document.getElementById("skill-state")!;

// ── 서버 접속 ───────────────────────────────────────────────
const client = new Client(`ws://${location.hostname}:${SERVER_PORT}`);
let room: Room;
try {
  room = await client.joinOrCreate(RAID_ROOM);
  hud.textContent =
    "이동: WASD/방향키  ·  기본공격: 마우스 좌클릭(홀드)  ·  스킬: Q 또는 우클릭  ·  더미를 잡아보세요!";
} catch (err) {
  hud.textContent = "❌ 서버 접속 실패 — 서버가 켜져 있나요?";
  throw err;
}

// ── 엔티티 렌더링 ───────────────────────────────────────────
interface EntityView {
  container: Container;
  hpFill: Graphics;
  hpWidth: number;
}
const players = new Map<string, EntityView>();
const enemies = new Map<string, EntityView>();

function makeBar(width: number, y: number, color: number): { bg: Graphics; fill: Graphics } {
  const bg = new Graphics().rect(-width / 2, y, width, 5).fill(0x000000);
  const fill = new Graphics().rect(0, y, width, 5).fill(color);
  fill.pivot.x = 0;
  fill.x = -width / 2;
  return { bg, fill };
}

function addPlayer(sessionId: string, color: string) {
  const container = new Container();
  const body = new Graphics().circle(0, 0, PLAYER_RADIUS).fill(color);
  if (sessionId === room.sessionId) {
    body.circle(0, 0, PLAYER_RADIUS + 4).stroke({ width: 2, color: 0xffffff });
  }
  const { bg, fill } = makeBar(40, -(PLAYER_RADIUS + 14), 0x4ade80);
  container.addChild(body, bg, fill);
  worldLayer.addChild(container);
  players.set(sessionId, { container, hpFill: fill, hpWidth: 40 });
}

function addEnemy(id: string) {
  const container = new Container();
  const body = new Graphics()
    .circle(0, 0, DUMMY_RADIUS)
    .fill(0x7f1d1d)
    .circle(0, 0, DUMMY_RADIUS)
    .stroke({ width: 3, color: 0xef4444 });
  const label = new Text({
    text: "연습용 더미",
    style: { fill: 0xfca5a5, fontSize: 11 },
  });
  label.anchor.set(0.5);
  label.y = 4;
  const { bg, fill } = makeBar(70, -(DUMMY_RADIUS + 16), 0xef4444);
  container.addChild(body, label, bg, fill);
  worldLayer.addChild(container);
  enemies.set(id, { container, hpFill: fill, hpWidth: 70 });
}

room.state.players.onAdd((player: any, sessionId: string) => {
  addPlayer(sessionId, player.color);
});
room.state.players.onRemove((_p: any, sessionId: string) => {
  players.get(sessionId)?.container.destroy();
  players.delete(sessionId);
});
room.state.enemies.onAdd((_enemy: any, id: string) => addEnemy(id));
room.state.enemies.onRemove((_e: any, id: string) => {
  enemies.get(id)?.container.destroy();
  enemies.delete(id);
});

// ── 일회성 이펙트 (스윙 / 폭발 / 대미지 숫자) ───────────────
interface Fx {
  obj: Container;
  age: number;
  ttl: number;
  tick: (fx: Fx, t: number) => void;
}
const fxs: Fx[] = [];
function addFx(obj: Container, ttl: number, tick: Fx["tick"]) {
  fxLayer.addChild(obj);
  fxs.push({ obj, age: 0, ttl, tick });
}

room.onMessage(EV_SWING, (e: SwingEvent) => {
  const g = new Graphics();
  const spread = 0.6;
  g.moveTo(0, 0)
    .arc(0, 0, 95, e.angle - spread, e.angle + spread)
    .lineTo(0, 0)
    .fill({ color: 0xffffff, alpha: 0.25 });
  g.position.set(e.x, e.y);
  addFx(g, 0.18, (fx, t) => (fx.obj.alpha = 1 - t));
});

room.onMessage(EV_BLAST, (e: BlastEvent) => {
  const g = new Graphics().circle(0, 0, SKILL_RADIUS).fill({ color: 0x60a5fa, alpha: 0.35 });
  g.position.set(e.x, e.y);
  addFx(g, 0.35, (fx, t) => {
    fx.obj.alpha = 0.5 * (1 - t);
    fx.obj.scale.set(0.6 + 0.6 * t);
  });
});

room.onMessage(EV_DAMAGE, (e: DamageEvent) => {
  const txt = new Text({
    text: `${Math.round(e.amount)}`,
    style: { fill: 0xfde047, fontSize: 18, fontWeight: "bold" },
  });
  txt.anchor.set(0.5);
  txt.position.set(e.x + (Math.random() * 24 - 12), e.y - DUMMY_RADIUS);
  addFx(txt, 0.8, (fx, t) => {
    fx.obj.y -= 0.6;
    fx.obj.alpha = 1 - t;
  });
});

// ── 입력 ────────────────────────────────────────────────────
const keys = new Set<string>();
window.addEventListener("keydown", (e) => {
  keys.add(e.key.toLowerCase());
  if (e.key.toLowerCase() === "q") sendSkill();
});
window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));

let aimX = WORLD_WIDTH / 2;
let aimY = WORLD_HEIGHT / 2;
app.canvas.addEventListener("mousemove", (e) => {
  const r = app.canvas.getBoundingClientRect();
  aimX = e.clientX - r.left;
  aimY = e.clientY - r.top;
});
let attacking = false;
app.canvas.addEventListener("mousedown", (e) => {
  if (e.button === 0) attacking = true;
  else if (e.button === 2) sendSkill();
});
window.addEventListener("mouseup", (e) => {
  if (e.button === 0) attacking = false;
});

function sendSkill() {
  if (room) room.send(MSG_SKILL, { aimX, aimY } as AimMessage);
}

// 이동 입력 (변경 시에만 전송)
let seq = 0;
let lastMove = "";
function sendMove() {
  const input: InputMessage = {
    up: keys.has("w") || keys.has("arrowup"),
    down: keys.has("s") || keys.has("arrowdown"),
    left: keys.has("a") || keys.has("arrowleft"),
    right: keys.has("d") || keys.has("arrowright"),
    seq: seq++,
  };
  const sig = `${input.up}${input.down}${input.left}${input.right}`;
  if (sig !== lastMove) {
    room.send(MSG_INPUT, input);
    lastMove = sig;
  }
}

// ── 렌더 루프 ───────────────────────────────────────────────
let lastBasic = 0;
app.ticker.add((ticker) => {
  const now = ticker.lastTime;
  const dt = ticker.deltaMS / 1000;
  const smooth = Math.min(1, dt * 15);

  sendMove();

  // 기본공격 홀드 (60ms 간격으로 전송, 서버가 쿨다운으로 게이팅)
  if (attacking && now - lastBasic > 60) {
    room.send(MSG_ATTACK, { aimX, aimY } as AimMessage);
    lastBasic = now;
  }

  // 플레이어 갱신
  room.state.players.forEach((p: any, sessionId: string) => {
    const view = players.get(sessionId);
    if (!view) return;
    view.container.x += (p.x - view.container.x) * smooth;
    view.container.y += (p.y - view.container.y) * smooth;
    view.hpFill.scale.x = Math.max(0, p.hp / p.maxHp);
  });

  // 몹 갱신
  room.state.enemies.forEach((e: any, id: string) => {
    const view = enemies.get(id);
    if (!view) return;
    view.container.x = e.x;
    view.container.y = e.y;
    view.container.visible = e.alive;
    view.hpFill.scale.x = Math.max(0, e.hp / e.maxHp);
  });

  // 이펙트 갱신
  for (let i = fxs.length - 1; i >= 0; i--) {
    const fx = fxs[i];
    fx.age += dt;
    const t = Math.min(1, fx.age / fx.ttl);
    fx.tick(fx, t);
    if (fx.age >= fx.ttl) {
      fx.obj.destroy();
      fxs.splice(i, 1);
    }
  }

  // 내 HUD 갱신
  const me: any = room.state.players.get(room.sessionId);
  if (me) {
    hpVal.textContent = `${Math.round(me.hp)}`;
    hpBar.style.width = `${(me.hp / me.maxHp) * 100}%`;
    mpVal.textContent = `${Math.round(me.mana)}`;
    mpBar.style.width = `${(me.mana / me.maxMana) * 100}%`;
    if (me.skillCd > 0) {
      skillState.innerHTML = `스킬(Q): <b style="color:#f87171">${me.skillCd.toFixed(1)}s</b>`;
    } else if (me.mana < 30) {
      skillState.innerHTML = `스킬(Q): <b style="color:#f87171">마나 부족</b>`;
    } else {
      skillState.innerHTML = `스킬(Q): <b style="color:#4ade80">준비됨</b>`;
    }
  }
});
