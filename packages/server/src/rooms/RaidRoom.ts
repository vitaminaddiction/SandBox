import { Room, Client } from "colyseus";
import { Schema, MapSchema, type } from "@colyseus/schema";
import {
  AimMessage,
  BASIC_CD,
  BASIC_HALF_ARC,
  BASIC_RANGE,
  BlastEvent,
  DEFAULT_ROLE,
  EV_BLAST,
  EV_FLOAT,
  EV_GOLEM_HIT,
  EV_HEAL,
  EV_SWING,
  FloatEvent,
  GolemHitEvent,
  GOLEM_ATTACK_CD,
  GOLEM_ATTACK_RANGE,
  GOLEM_DMG,
  GOLEM_MAX_HP,
  GOLEM_RADIUS,
  GOLEM_RESPAWN,
  GOLEM_SPEED,
  HealEvent,
  HEAL_AMOUNT,
  HEAL_COST,
  HEAL_CD,
  HEAL_RADIUS,
  HEAL_THREAT_MULT,
  InputMessage,
  MANA_REGEN,
  MSG_ATTACK,
  MSG_INPUT,
  MSG_ROLE,
  MSG_SKILL,
  PLAYER_RADIUS,
  PLAYER_RESPAWN,
  PLAYER_SPAWN_X,
  PLAYER_SPAWN_Y,
  PLAYER_SPEED,
  Role,
  ROLE_STATS,
  RoleMessage,
  SKILL_CD,
  SKILL_COST,
  SKILL_DMG,
  SKILL_RADIUS,
  SKILL_RANGE,
  SwingEvent,
  TAUNT_CD,
  TAUNT_THREAT,
  TICK_MS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from "@boro/shared";

// 탭을 구분하기 위한 색상 팔레트
const COLORS = [
  "#e6194b", "#3cb44b", "#4363d8", "#f58231",
  "#911eb4", "#42d4f4", "#f032e6", "#bfef45",
  "#fabed4", "#469990",
];

/** 서버가 동기화하는 플레이어 상태 */
export class Player extends Schema {
  @type("number") x = PLAYER_SPAWN_X;
  @type("number") y = PLAYER_SPAWN_Y;
  @type("string") color = "#ffffff";
  @type("string") role: Role = DEFAULT_ROLE;
  @type("number") hp = ROLE_STATS[DEFAULT_ROLE].maxHp;
  @type("number") maxHp = ROLE_STATS[DEFAULT_ROLE].maxHp;
  @type("number") mana = ROLE_STATS[DEFAULT_ROLE].maxMana;
  @type("number") maxMana = ROLE_STATS[DEFAULT_ROLE].maxMana;
  @type("number") basicCd = 0;
  @type("number") skillCd = 0;
  @type("boolean") dead = false;
  @type("number") respawnIn = 0;

  input: InputMessage = { up: false, down: false, left: false, right: false, seq: 0 };
}

/** 훈련 골렘 (어그로 대상을 쫓아가 근접 공격) */
export class Golem extends Schema {
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") hp = GOLEM_MAX_HP;
  @type("number") maxHp = GOLEM_MAX_HP;
  @type("number") radius = GOLEM_RADIUS;
  @type("boolean") alive = true;
  @type("string") target = ""; // 현재 어그로 대상 sessionId

  // 서버 전용
  respawnIn = 0;
  attackCd = 0;
  threat = new Map<string, number>();
}

/** 레이드 룸 전체 상태 */
export class RaidState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();
  @type({ map: Golem }) enemies = new MapSchema<Golem>();
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

    const golem = new Golem();
    golem.x = WORLD_WIDTH / 2;
    golem.y = 160;
    this.state.enemies.set("golem", golem);

    this.setSimulationInterval((dt) => this.update(dt), TICK_MS);

    this.onMessage(MSG_INPUT, (client, input: InputMessage) => {
      const player = this.state.players.get(client.sessionId);
      if (player) player.input = input;
    });
    this.onMessage(MSG_ATTACK, (client, aim: AimMessage) => this.handleBasic(client.sessionId, aim));
    this.onMessage(MSG_SKILL, (client, aim: AimMessage) => this.handleSkill(client.sessionId, aim));
    this.onMessage(MSG_ROLE, (client, msg: RoleMessage) => this.handleRole(client.sessionId, msg.role));

    console.log("[RaidRoom] created");
  }

  onJoin(client: Client) {
    const player = new Player();
    player.color = COLORS[this.state.players.size % COLORS.length];
    this.applyRole(player, DEFAULT_ROLE, false);
    this.state.players.set(client.sessionId, player);
    console.log(`[RaidRoom] ${client.sessionId} joined (${this.state.players.size})`);
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
    this.state.enemies.forEach((e) => e.threat.delete(client.sessionId));
    console.log(`[RaidRoom] ${client.sessionId} left (${this.state.players.size})`);
  }

  // ── 역할 ────────────────────────────────────────────────────
  private handleRole(sessionId: string, role: Role) {
    const p = this.state.players.get(sessionId);
    if (!p || !ROLE_STATS[role]) return;
    this.applyRole(p, role, true);
  }

  /** 역할 스탯 적용 (keepRatio=true면 HP/마나 비율 유지) */
  private applyRole(p: Player, role: Role, keepRatio: boolean) {
    const s = ROLE_STATS[role];
    const hpRatio = keepRatio && p.maxHp > 0 ? p.hp / p.maxHp : 1;
    const manaRatio = keepRatio && p.maxMana > 0 ? p.mana / p.maxMana : 1;
    p.role = role;
    p.maxHp = s.maxHp;
    p.maxMana = s.maxMana;
    p.hp = p.dead ? 0 : Math.round(s.maxHp * hpRatio);
    p.mana = Math.round(s.maxMana * manaRatio);
    p.basicCd = 0;
    p.skillCd = 0;
  }

  // ── 기본 공격: 조준 방향 부채꼴 근접 스윙 ──────────────────
  private handleBasic(sessionId: string, aim: AimMessage) {
    const p = this.state.players.get(sessionId);
    if (!p || p.dead || p.basicCd > 0) return;
    p.basicCd = BASIC_CD;

    const s = ROLE_STATS[p.role as Role];
    const angle = Math.atan2(aim.aimY - p.y, aim.aimX - p.x);
    this.broadcast(EV_SWING, { x: p.x, y: p.y, angle } as SwingEvent);

    const rangeSq = BASIC_RANGE * BASIC_RANGE;
    this.state.enemies.forEach((e) => {
      if (!e.alive) return;
      if (dist2(p.x, p.y, e.x, e.y) > rangeSq + e.radius * e.radius) return;
      const toEnemy = Math.atan2(e.y - p.y, e.x - p.x);
      let diff = Math.abs(toEnemy - angle);
      if (diff > Math.PI) diff = 2 * Math.PI - diff;
      if (diff <= BASIC_HALF_ARC) this.damageEnemy(e, s.basicDmg, sessionId, s.threatMult);
    });
  }

  // ── 역할 스킬(Q) 분기 ──────────────────────────────────────
  private handleSkill(sessionId: string, aim: AimMessage) {
    const p = this.state.players.get(sessionId);
    if (!p || p.dead || p.skillCd > 0) return;
    switch (p.role as Role) {
      case "dps": return this.skillBlast(p, sessionId, aim);
      case "tank": return this.skillTaunt(p, sessionId);
      case "healer": return this.skillHeal(p, sessionId);
    }
  }

  private skillBlast(p: Player, sessionId: string, aim: AimMessage) {
    if (p.mana < SKILL_COST) return;
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

    const hitSq = SKILL_RADIUS * SKILL_RADIUS;
    this.state.enemies.forEach((e) => {
      if (!e.alive) return;
      if (dist2(tx, ty, e.x, e.y) <= hitSq + e.radius * e.radius) {
        this.damageEnemy(e, SKILL_DMG, sessionId, 1);
      }
    });
  }

  private skillTaunt(p: Player, sessionId: string) {
    p.skillCd = TAUNT_CD;
    // 모든 적의 어그로를 즉시 강탈
    this.state.enemies.forEach((e) => {
      if (!e.alive) return;
      let maxThreat = 0;
      e.threat.forEach((t) => (maxThreat = Math.max(maxThreat, t)));
      e.threat.set(sessionId, maxThreat + TAUNT_THREAT);
      e.target = sessionId;
    });
  }

  private skillHeal(p: Player, sessionId: string) {
    if (p.mana < HEAL_COST) return;
    p.skillCd = HEAL_CD;
    p.mana -= HEAL_COST;
    this.broadcast(EV_HEAL, { x: p.x, y: p.y } as HealEvent);

    const radiusSq = HEAL_RADIUS * HEAL_RADIUS;
    let totalHealed = 0;
    this.state.players.forEach((ally) => {
      if (ally.dead) return;
      if (dist2(p.x, p.y, ally.x, ally.y) > radiusSq) return;
      const before = ally.hp;
      ally.hp = Math.min(ally.maxHp, ally.hp + HEAL_AMOUNT);
      const healed = ally.hp - before;
      if (healed > 0) {
        totalHealed += healed;
        this.broadcast(EV_FLOAT, { x: ally.x, y: ally.y, amount: healed, kind: "heal" } as FloatEvent);
      }
    });
    // 치유도 약간의 어그로 발생 → 탱커 없이 힐하면 위험
    if (totalHealed > 0) {
      this.state.enemies.forEach((e) => {
        if (e.alive) this.addThreat(e, sessionId, totalHealed * HEAL_THREAT_MULT);
      });
    }
  }

  private damageEnemy(e: Golem, amount: number, attackerId: string, threatMult: number) {
    e.hp = Math.max(0, e.hp - amount);
    this.addThreat(e, attackerId, amount * threatMult);
    this.broadcast(EV_FLOAT, { x: e.x, y: e.y, amount, kind: "hit" } as FloatEvent);
    if (e.hp <= 0) {
      e.alive = false;
      e.respawnIn = GOLEM_RESPAWN;
      e.target = "";
      e.threat.clear();
    }
  }

  private addThreat(e: Golem, sessionId: string, amount: number) {
    e.threat.set(sessionId, (e.threat.get(sessionId) ?? 0) + amount);
  }

  private damagePlayer(p: Player, sessionId: string, amount: number, e: Golem) {
    const s = ROLE_STATS[p.role as Role];
    const dmg = Math.max(1, Math.round(amount * (1 - s.dmgReduction)));
    p.hp = Math.max(0, p.hp - dmg);
    this.broadcast(EV_FLOAT, { x: p.x, y: p.y, amount: dmg, kind: "hurt" } as FloatEvent);
    if (p.hp <= 0) {
      p.dead = true;
      p.respawnIn = PLAYER_RESPAWN;
      e.threat.delete(sessionId);
      if (e.target === sessionId) e.target = "";
    }
  }

  /** 서버 시뮬레이션 */
  private update(dtMs: number) {
    const dt = dtMs / 1000;

    // 플레이어: 이동 · 쿨다운 · 마나 · 부활
    this.state.players.forEach((player) => {
      if (player.dead) {
        player.respawnIn = Math.max(0, player.respawnIn - dt);
        if (player.respawnIn <= 0) {
          player.dead = false;
          player.hp = player.maxHp;
          player.mana = player.maxMana;
          player.x = PLAYER_SPAWN_X;
          player.y = PLAYER_SPAWN_Y;
        }
        return;
      }

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

      if (player.basicCd > 0) player.basicCd = Math.max(0, player.basicCd - dt);
      if (player.skillCd > 0) player.skillCd = Math.max(0, player.skillCd - dt);
      if (player.mana < player.maxMana) {
        player.mana = Math.min(player.maxMana, player.mana + MANA_REGEN * dt);
      }
    });

    // 골렘: 타게팅 · 추격 · 공격 · 부활
    this.state.enemies.forEach((e) => {
      if (!e.alive) {
        e.respawnIn -= dt;
        if (e.respawnIn <= 0) {
          e.alive = true;
          e.hp = e.maxHp;
        }
        return;
      }
      this.updateGolem(e, dt);
    });
  }

  private updateGolem(e: Golem, dt: number) {
    // 어그로 1위(살아있는 플레이어) 선정
    let bestId = "";
    let bestThreat = -1;
    e.threat.forEach((t, id) => {
      const pl = this.state.players.get(id);
      if (!pl || pl.dead) return;
      if (t > bestThreat) {
        bestThreat = t;
        bestId = id;
      }
    });
    e.target = bestId;
    if (e.attackCd > 0) e.attackCd = Math.max(0, e.attackCd - dt);
    if (!bestId) return;

    const target = this.state.players.get(bestId)!;
    const d = Math.sqrt(dist2(e.x, e.y, target.x, target.y));
    const reach = GOLEM_ATTACK_RANGE + e.radius;
    if (d > reach) {
      // 추격
      const k = (GOLEM_SPEED * dt) / (d || 1);
      e.x += (target.x - e.x) * k;
      e.y += (target.y - e.y) * k;
    } else if (e.attackCd <= 0) {
      // 근접 공격
      e.attackCd = GOLEM_ATTACK_CD;
      this.broadcast(EV_GOLEM_HIT, { x: target.x, y: target.y } as GolemHitEvent);
      this.damagePlayer(target, bestId, GOLEM_DMG, e);
    }
  }
}
