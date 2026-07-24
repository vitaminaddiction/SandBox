import { Room, Client } from "colyseus";
import { Schema, MapSchema, type } from "@colyseus/schema";
import {
  AimMessage,
  BASIC_CD,
  BASIC_DMG,
  BASIC_HALF_ARC,
  BASIC_RANGE,
  BlastEvent,
  DamageEvent,
  DUMMY_MAX_HP,
  DUMMY_RADIUS,
  DUMMY_RESPAWN,
  EV_BLAST,
  EV_DAMAGE,
  EV_SWING,
  InputMessage,
  MANA_REGEN,
  MSG_ATTACK,
  MSG_INPUT,
  MSG_SKILL,
  PLAYER_MAX_HP,
  PLAYER_MAX_MANA,
  PLAYER_RADIUS,
  PLAYER_SPEED,
  SKILL_CD,
  SKILL_COST,
  SKILL_DMG,
  SKILL_RADIUS,
  SKILL_RANGE,
  SwingEvent,
  TICK_MS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from "@fellowship/shared";

// 탭을 구분하기 위한 색상 팔레트
const COLORS = [
  "#e6194b", "#3cb44b", "#4363d8", "#f58231",
  "#911eb4", "#42d4f4", "#f032e6", "#bfef45",
  "#fabed4", "#469990",
];

/** 서버가 동기화하는 플레이어 상태 */
export class Player extends Schema {
  @type("number") x = WORLD_WIDTH / 2;
  @type("number") y = WORLD_HEIGHT / 2;
  @type("string") color = "#ffffff";
  @type("number") hp = PLAYER_MAX_HP;
  @type("number") maxHp = PLAYER_MAX_HP;
  @type("number") mana = PLAYER_MAX_MANA;
  @type("number") maxMana = PLAYER_MAX_MANA;
  @type("number") basicCd = 0; // 남은 쿨다운(초)
  @type("number") skillCd = 0;

  // 서버 전용 (동기화 안 함)
  input: InputMessage = { up: false, down: false, left: false, right: false, seq: 0 };
}

/** 연습용 몹(더미) */
export class Enemy extends Schema {
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") hp = DUMMY_MAX_HP;
  @type("number") maxHp = DUMMY_MAX_HP;
  @type("number") radius = DUMMY_RADIUS;
  @type("boolean") alive = true;

  // 서버 전용
  respawnIn = 0;
}

/** 레이드 룸 전체 상태 */
export class RaidState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();
  @type({ map: Enemy }) enemies = new MapSchema<Enemy>();
}

const clamp = (v: number, min: number, max: number) =>
  v < min ? min : v > max ? max : v;

const dist2 = (ax: number, ay: number, bx: number, by: number) => {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
};

export class RaidRoom extends Room<RaidState> {
  maxClients = 10;

  onCreate() {
    this.setState(new RaidState());

    // 연습용 더미 하나 소환 (상단 중앙)
    const dummy = new Enemy();
    dummy.x = WORLD_WIDTH / 2;
    dummy.y = 130;
    this.state.enemies.set("dummy", dummy);

    // 권한 서버: 일정한 틱으로 시뮬레이션
    this.setSimulationInterval((dt) => this.update(dt), TICK_MS);

    this.onMessage(MSG_INPUT, (client, input: InputMessage) => {
      const player = this.state.players.get(client.sessionId);
      if (player) player.input = input;
    });

    this.onMessage(MSG_ATTACK, (client, aim: AimMessage) => {
      this.handleBasic(client.sessionId, aim);
    });

    this.onMessage(MSG_SKILL, (client, aim: AimMessage) => {
      this.handleSkill(client.sessionId, aim);
    });

    console.log("[RaidRoom] created");
  }

  onJoin(client: Client) {
    const player = new Player();
    player.color = COLORS[this.state.players.size % COLORS.length];
    this.state.players.set(client.sessionId, player);
    console.log(`[RaidRoom] ${client.sessionId} joined (${this.state.players.size})`);
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
    console.log(`[RaidRoom] ${client.sessionId} left (${this.state.players.size})`);
  }

  // ── 기본 공격: 조준 방향 부채꼴 근접 스윙 ──────────────────
  private handleBasic(sessionId: string, aim: AimMessage) {
    const p = this.state.players.get(sessionId);
    if (!p || p.basicCd > 0) return;
    p.basicCd = BASIC_CD;

    const angle = Math.atan2(aim.aimY - p.y, aim.aimX - p.x);
    this.broadcast(EV_SWING, { x: p.x, y: p.y, angle } as SwingEvent);

    const rangeSq = BASIC_RANGE * BASIC_RANGE;
    this.state.enemies.forEach((e) => {
      if (!e.alive) return;
      if (dist2(p.x, p.y, e.x, e.y) > rangeSq + e.radius * e.radius) return;
      // 조준 방향과의 각도 차이 확인
      const toEnemy = Math.atan2(e.y - p.y, e.x - p.x);
      let diff = Math.abs(toEnemy - angle);
      if (diff > Math.PI) diff = 2 * Math.PI - diff;
      if (diff <= BASIC_HALF_ARC) this.damageEnemy(e, BASIC_DMG);
    });
  }

  // ── 스킬 1: 조준 지점 광역 폭발 (마나 소모) ────────────────
  private handleSkill(sessionId: string, aim: AimMessage) {
    const p = this.state.players.get(sessionId);
    if (!p || p.skillCd > 0 || p.mana < SKILL_COST) return;

    // 사거리 제한: 너무 멀면 최대 사거리 방향으로 당김
    let tx = aim.aimX;
    let ty = aim.aimY;
    const d = Math.sqrt(dist2(p.x, p.y, tx, ty));
    if (d > SKILL_RANGE) {
      const k = SKILL_RANGE / d;
      tx = p.x + (tx - p.x) * k;
      ty = p.y + (ty - p.y) * k;
    }

    p.skillCd = SKILL_CD;
    p.mana -= SKILL_COST;
    this.broadcast(EV_BLAST, { x: tx, y: ty } as BlastEvent);

    const hitSq = (SKILL_RADIUS) * (SKILL_RADIUS);
    this.state.enemies.forEach((e) => {
      if (!e.alive) return;
      if (dist2(tx, ty, e.x, e.y) <= hitSq + e.radius * e.radius) {
        this.damageEnemy(e, SKILL_DMG);
      }
    });
  }

  private damageEnemy(e: Enemy, amount: number) {
    e.hp = Math.max(0, e.hp - amount);
    this.broadcast(EV_DAMAGE, { x: e.x, y: e.y, amount } as DamageEvent);
    if (e.hp <= 0) {
      e.alive = false;
      e.respawnIn = DUMMY_RESPAWN;
    }
  }

  /** 서버 시뮬레이션 (이동 · 쿨다운 · 마나 · 리스폰) */
  private update(dtMs: number) {
    const dt = dtMs / 1000;

    this.state.players.forEach((player) => {
      // 이동
      const i = player.input;
      let dx = (i.right ? 1 : 0) - (i.left ? 1 : 0);
      let dy = (i.down ? 1 : 0) - (i.up ? 1 : 0);
      if (dx !== 0 && dy !== 0) {
        const inv = 1 / Math.SQRT2;
        dx *= inv;
        dy *= inv;
      }
      player.x = clamp(player.x + dx * PLAYER_SPEED * dt, PLAYER_RADIUS, WORLD_WIDTH - PLAYER_RADIUS);
      player.y = clamp(player.y + dy * PLAYER_SPEED * dt, PLAYER_RADIUS, WORLD_HEIGHT - PLAYER_RADIUS);

      // 쿨다운 감소
      if (player.basicCd > 0) player.basicCd = Math.max(0, player.basicCd - dt);
      if (player.skillCd > 0) player.skillCd = Math.max(0, player.skillCd - dt);

      // 마나 재생
      if (player.mana < player.maxMana) {
        player.mana = Math.min(player.maxMana, player.mana + MANA_REGEN * dt);
      }
    });

    // 몹 리스폰
    this.state.enemies.forEach((e) => {
      if (!e.alive) {
        e.respawnIn -= dt;
        if (e.respawnIn <= 0) {
          e.alive = true;
          e.hp = e.maxHp;
        }
      }
    });
  }
}
