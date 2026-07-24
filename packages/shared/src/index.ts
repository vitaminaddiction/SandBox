/**
 * 서버와 클라이언트가 공유하는 상수 · 타입.
 * 게임 규칙의 "단일 진실 공급원(single source of truth)".
 */

// ── 네트워크 ────────────────────────────────────────────────
export const SERVER_PORT = 2567;
export const RAID_ROOM = "raid";

// ── 월드 ────────────────────────────────────────────────────
export const WORLD_WIDTH = 800;
export const WORLD_HEIGHT = 600;

// ── 플레이어 이동 ───────────────────────────────────────────
export const PLAYER_SPEED = 200; // px per second
export const PLAYER_RADIUS = 16;
export const PLAYER_SPAWN_X = WORLD_WIDTH / 2;
export const PLAYER_SPAWN_Y = WORLD_HEIGHT - 80;
export const PLAYER_RESPAWN = 5; // 사망 후 부활까지(초)

// ── 시뮬레이션 ──────────────────────────────────────────────
export const TICK_RATE = 20; // 서버 시뮬레이션 틱 (회/초)
export const TICK_MS = 1000 / TICK_RATE;

// ── 역할(트리니티) ─────────────────────────────────────────
export type Role = "tank" | "healer" | "dps";
export const ROLES: Role[] = ["tank", "healer", "dps"];

export interface RoleStat {
  label: string; // "탱커"
  short: string; // "탱"
  maxHp: number;
  maxMana: number;
  basicDmg: number;
  threatMult: number; // 기본공격이 만드는 어그로 배수
  dmgReduction: number; // 받는 피해 감소 0..1
  color: number; // 역할 표시 색
  skillLabel: string; // Q 스킬 이름
}
export const ROLE_STATS: Record<Role, RoleStat> = {
  tank:   { label: "탱커", short: "탱", maxHp: 240, maxMana: 60,  basicDmg: 8,  threatMult: 4, dmgReduction: 0.5, color: 0x3b82f6, skillLabel: "도발" },
  healer: { label: "힐러", short: "힐", maxHp: 110, maxMana: 150, basicDmg: 6,  threatMult: 1, dmgReduction: 0.0, color: 0x22c55e, skillLabel: "치유" },
  dps:    { label: "딜러", short: "딜", maxHp: 120, maxMana: 100, basicDmg: 14, threatMult: 1, dmgReduction: 0.0, color: 0xef4444, skillLabel: "폭발" },
};
export const DEFAULT_ROLE: Role = "dps";

// ── 전투: 공통 자원 ────────────────────────────────────────
export const MANA_REGEN = 12; // per second

// 기본 공격 (근접 부채꼴 스윙, 마나 무료) — 대미지는 역할별
export const BASIC_RANGE = 95;
export const BASIC_HALF_ARC = 0.6; // 조준 방향 기준 ±각(라디안)
export const BASIC_CD = 0.4; // seconds

// 딜러 스킬: 조준 지점 광역 폭발
export const SKILL_DMG = 34;
export const SKILL_RANGE = 300;
export const SKILL_RADIUS = 70;
export const SKILL_CD = 3.5;
export const SKILL_COST = 30;

// 탱커 스킬: 도발 (어그로 강탈)
export const TAUNT_CD = 6;
export const TAUNT_THREAT = 1000; // 대상에게 즉시 부여되는 어그로

// 힐러 스킬: 광역 치유 (자신 주변)
export const HEAL_AMOUNT = 34;
export const HEAL_RADIUS = 150;
export const HEAL_COST = 35;
export const HEAL_CD = 1.8;
export const HEAL_THREAT_MULT = 0.3; // 치유량에 비례해 힐러가 얻는 어그로

// ── 전투: 몹(훈련 골렘) ─────────────────────────────────────
export const GOLEM_MAX_HP = 500;
export const GOLEM_RADIUS = 30;
export const GOLEM_RESPAWN = 4; // seconds
export const GOLEM_SPEED = 95; // 플레이어보다 느림 → 카이팅 가능
export const GOLEM_DMG = 16;
export const GOLEM_ATTACK_RANGE = 50;
export const GOLEM_ATTACK_CD = 1.5;

// ── 클라 → 서버 메시지 ──────────────────────────────────────
export const MSG_INPUT = "input";
export const MSG_ATTACK = "attack"; // 기본 공격
export const MSG_SKILL = "skill"; // 역할 스킬(Q)
export const MSG_ROLE = "role"; // 역할 변경

/** 한 틱 동안의 이동 입력 (정규화 전, -1|0|1) */
export interface InputMessage {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  seq: number;
}

/** 조준 좌표 (월드 기준) — 공격/스킬에 사용 */
export interface AimMessage {
  aimX: number;
  aimY: number;
}

/** 역할 변경 요청 */
export interface RoleMessage {
  role: Role;
}

// ── 서버 → 클라 이벤트 (일회성 시각 효과) ───────────────────
export const EV_SWING = "swing"; // 기본 공격 스윙
export const EV_BLAST = "blast"; // 딜러 폭발
export const EV_HEAL = "heal"; // 힐러 치유 파동
export const EV_GOLEM_HIT = "golemhit"; // 골렘의 근접 타격
export const EV_FLOAT = "float"; // 떠오르는 숫자 (피해/치유)

export interface SwingEvent {
  x: number;
  y: number;
  angle: number;
}
export interface BlastEvent {
  x: number;
  y: number;
}
export interface HealEvent {
  x: number;
  y: number;
}
export interface GolemHitEvent {
  x: number;
  y: number;
}
export interface FloatEvent {
  x: number;
  y: number;
  amount: number;
  kind: "hit" | "hurt" | "heal"; // 몹 피해 / 플레이어 피해 / 치유
}
