import { Application, Container, Graphics, Text } from "pixi.js";
import { Client, getStateCallbacks, Room } from "colyseus.js";
import {
  AimMessage,
  BlastEvent,
  EV_BLAST,
  EV_FLOAT,
  EV_GOLEM_HIT,
  EV_HEAL,
  EV_SWING,
  FloatEvent,
  GolemHitEvent,
  GOLEM_RADIUS,
  HealEvent,
  HEAL_RADIUS,
  InputMessage,
  MSG_ATTACK,
  MSG_INPUT,
  MSG_ROLE,
  MSG_SKILL,
  PLAYER_RADIUS,
  RAID_ROOM,
  Role,
  ROLE_STATS,
  SERVER_PORT,
  SKILL_RADIUS,
  SwingEvent,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from "@boro/shared";

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
const targetLine = new Graphics(); // 골렘 → 대상 연결선
const fxLayer = new Container();
app.stage.addChild(worldLayer, targetLine, fxLayer);

// ── 하단 상태 바 ────────────────────────────────────────────
const statusBar = document.createElement("div");
statusBar.style.cssText =
  "display:flex;gap:14px;align-items:center;font-size:13px;width:800px;justify-content:center;flex-wrap:wrap";
statusBar.innerHTML = `
  <span id="role-tag" style="padding:2px 8px;border-radius:4px;font-weight:bold">딜러</span>
  <span>HP <b id="hp-val">0</b></span>
  <div style="width:150px;height:12px;background:#333;border-radius:6px;overflow:hidden">
    <div id="hp-bar" style="height:100%;width:100%;background:#4ade80"></div>
  </div>
  <span>MP <b id="mp-val">0</b></span>
  <div style="width:150px;height:12px;background:#333;border-radius:6px;overflow:hidden">
    <div id="mp-bar" style="height:100%;width:100%;background:#60a5fa"></div>
  </div>
  <span id="skill-state" style="min-width:130px"></span>
`;
document.body.appendChild(statusBar);
const roleTag = document.getElementById("role-tag")!;
const hpVal = document.getElementById("hp-val")!;
const hpBar = document.getElementById("hp-bar")! as HTMLElement;
const mpVal = document.getElementById("mp-val")!;
const mpBar = document.getElementById("mp-bar")! as HTMLElement;
const skillState = document.getElementById("skill-state")!;

const hex = (n: number) => "#" + n.toString(16).padStart(6, "0");

// ── 서버 접속 ───────────────────────────────────────────────
const client = new Client(`ws://${location.hostname}:${SERVER_PORT}`);
let room: Room;
try {
  room = await client.joinOrCreate(RAID_ROOM);
  hud.textContent =
    "이동: WASD  ·  기본공격: 좌클릭(홀드)  ·  스킬: Q/우클릭  ·  역할전환: 1탱커 2힐러 3딜러";
} catch (err) {
  hud.textContent = "❌ 서버 접속 실패 — 서버가 켜져 있나요?";
  throw err;
}

// ── 엔티티 렌더링 ───────────────────────────────────────────
interface PlayerView {
  container: Container;
  body: Graphics;
  hpFill: Graphics;
  roleText: Text;
  respawnText: Text;
  role: Role | "";
}
interface EnemyView {
  container: Container;
  hpFill: Graphics;
}
const players = new Map<string, PlayerView>();
const enemies = new Map<string, EnemyView>();

function makeBar(width: number, y: number, color: number): { bg: Graphics; fill: Graphics } {
  const bg = new Graphics().rect(-width / 2, y, width, 5).fill(0x000000);
  const fill = new Graphics().rect(0, y, width, 5).fill(color);
  fill.x = -width / 2;
  return { bg, fill };
}

function drawBody(view: PlayerView, color: string, role: Role, isSelf: boolean) {
  const g = view.body;
  g.clear();
  g.circle(0, 0, PLAYER_RADIUS).fill(color);
  g.circle(0, 0, PLAYER_RADIUS).stroke({ width: 3, color: ROLE_STATS[role].color });
  if (isSelf) g.circle(0, 0, PLAYER_RADIUS + 4).stroke({ width: 2, color: 0xffffff });
}

function addPlayer(sessionId: string, player: any) {
  const container = new Container();
  const body = new Graphics();
  const { bg, fill } = makeBar(40, -(PLAYER_RADIUS + 16), 0x4ade80);
  const roleText = new Text({ text: "", style: { fill: 0xffffff, fontSize: 11, fontWeight: "bold" } });
  roleText.anchor.set(0.5);
  roleText.y = -(PLAYER_RADIUS + 30);
  const respawnText = new Text({ text: "", style: { fill: 0xffffff, fontSize: 13, fontWeight: "bold" } });
  respawnText.anchor.set(0.5);
  respawnText.visible = false;
  container.addChild(body, bg, fill, roleText, respawnText);
  worldLayer.addChild(container);

  const view: PlayerView = { container, body, hpFill: fill, roleText, respawnText, role: "" };
  const isSelf = sessionId === room.sessionId;
  drawBody(view, player.color, player.role, isSelf);
  view.role = player.role;
  players.set(sessionId, view);
}

function addEnemy(id: string) {
  const container = new Container();
  const body = new Graphics()
    .circle(0, 0, GOLEM_RADIUS)
    .fill(0x7f1d1d)
    .circle(0, 0, GOLEM_RADIUS)
    .stroke({ width: 3, color: 0xef4444 });
  const label = new Text({ text: "훈련 골렘", style: { fill: 0xfca5a5, fontSize: 11 } });
  label.anchor.set(0.5);
  label.y = 4;
  const { bg, fill } = makeBar(80, -(GOLEM_RADIUS + 16), 0xef4444);
  container.addChild(body, label, bg, fill);
  worldLayer.addChild(container);
  enemies.set(id, { container, hpFill: fill });
}

const $ = getStateCallbacks(room);
$(room.state).players.onAdd((player: any, sessionId: string) => addPlayer(sessionId, player));
$(room.state).players.onRemove((_p: any, sessionId: string) => {
  players.get(sessionId)?.container.destroy();
  players.delete(sessionId);
});
$(room.state).enemies.onAdd((_e: any, id: string) => addEnemy(id));
$(room.state).enemies.onRemove((_e: any, id: string) => {
  enemies.get(id)?.container.destroy();
  enemies.delete(id);
});

// ── 일회성 이펙트 ───────────────────────────────────────────
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
  g.moveTo(0, 0).arc(0, 0, 95, e.angle - spread, e.angle + spread).lineTo(0, 0).fill({ color: 0xffffff, alpha: 0.25 });
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

room.onMessage(EV_HEAL, (e: HealEvent) => {
  const g = new Graphics().circle(0, 0, HEAL_RADIUS).fill({ color: 0x22c55e, alpha: 0.18 });
  g.position.set(e.x, e.y);
  addFx(g, 0.45, (fx, t) => {
    fx.obj.alpha = 0.25 * (1 - t);
    fx.obj.scale.set(0.4 + 0.6 * t);
  });
});

room.onMessage(EV_GOLEM_HIT, (e: GolemHitEvent) => {
  const g = new Graphics().circle(0, 0, PLAYER_RADIUS + 6).stroke({ width: 3, color: 0xef4444 });
  g.position.set(e.x, e.y);
  addFx(g, 0.25, (fx, t) => {
    fx.obj.alpha = 1 - t;
    fx.obj.scale.set(1 + 0.4 * t);
  });
});

const FLOAT_COLOR = { hit: 0xfde047, hurt: 0xf87171, heal: 0x4ade80 } as const;
room.onMessage(EV_FLOAT, (e: FloatEvent) => {
  const txt = new Text({
    text: (e.kind === "heal" ? "+" : "") + Math.round(e.amount),
    style: { fill: FLOAT_COLOR[e.kind], fontSize: e.kind === "hit" ? 18 : 16, fontWeight: "bold" },
  });
  txt.anchor.set(0.5);
  txt.position.set(e.x + (Math.random() * 24 - 12), e.y - 24);
  addFx(txt, 0.85, (fx, t) => {
    fx.obj.y -= 0.6;
    fx.obj.alpha = 1 - t;
  });
});

// ── 입력 ────────────────────────────────────────────────────
const keys = new Set<string>();
window.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  keys.add(k);
  if (k === "q") sendSkill();
  else if (k === "1") room.send(MSG_ROLE, { role: "tank" as Role });
  else if (k === "2") room.send(MSG_ROLE, { role: "healer" as Role });
  else if (k === "3") room.send(MSG_ROLE, { role: "dps" as Role });
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
  if (attacking && now - lastBasic > 60) {
    room.send(MSG_ATTACK, { aimX, aimY } as AimMessage);
    lastBasic = now;
  }

  // 플레이어 갱신
  room.state.players.forEach((p: any, sessionId: string) => {
    const view = players.get(sessionId);
    if (!view) return;
    const isSelf = sessionId === room.sessionId;
    view.container.x += (p.x - view.container.x) * smooth;
    view.container.y += (p.y - view.container.y) * smooth;
    view.hpFill.scale.x = Math.max(0, p.hp / p.maxHp);
    // 역할 변경 반영
    if (view.role !== p.role) {
      drawBody(view, p.color, p.role, isSelf);
      view.role = p.role;
    }
    const s = ROLE_STATS[p.role as Role];
    view.roleText.text = s.short;
    view.roleText.style.fill = s.color;
    // 사망 표시
    view.container.alpha = p.dead ? 0.25 : 1;
    view.respawnText.visible = p.dead;
    if (p.dead) view.respawnText.text = `부활 ${Math.ceil(p.respawnIn)}`;
  });

  // 골렘 갱신
  targetLine.clear();
  room.state.enemies.forEach((e: any, id: string) => {
    const view = enemies.get(id);
    if (!view) return;
    view.container.x = e.x;
    view.container.y = e.y;
    view.container.visible = e.alive;
    view.hpFill.scale.x = Math.max(0, e.hp / e.maxHp);
    // 어그로 대상 연결선
    if (e.alive && e.target) {
      const tv = players.get(e.target);
      if (tv) {
        targetLine
          .moveTo(e.x, e.y)
          .lineTo(tv.container.x, tv.container.y)
          .stroke({ width: 2, color: 0xef4444, alpha: 0.5 });
      }
    }
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

  // 내 HUD
  const me: any = room.state.players.get(room.sessionId);
  if (me) {
    const s = ROLE_STATS[me.role as Role];
    roleTag.textContent = s.label;
    roleTag.style.background = hex(s.color);
    roleTag.style.color = "#0b0e14";
    hpVal.textContent = `${Math.round(me.hp)}/${me.maxHp}`;
    hpBar.style.width = `${(me.hp / me.maxHp) * 100}%`;
    mpVal.textContent = `${Math.round(me.mana)}/${me.maxMana}`;
    mpBar.style.width = `${(me.mana / me.maxMana) * 100}%`;
    if (me.dead) {
      skillState.innerHTML = `<b style="color:#f87171">사망 — 부활 ${Math.ceil(me.respawnIn)}s</b>`;
    } else if (me.skillCd > 0) {
      skillState.innerHTML = `${s.skillLabel}(Q): <b style="color:#f87171">${me.skillCd.toFixed(1)}s</b>`;
    } else {
      skillState.innerHTML = `${s.skillLabel}(Q): <b style="color:#4ade80">준비됨</b>`;
    }
  }
});
