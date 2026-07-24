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

// ── 플레이어 ────────────────────────────────────────────────
export const PLAYER_SPEED = 200; // px per second
export const PLAYER_RADIUS = 16;

// ── 시뮬레이션 ──────────────────────────────────────────────
export const TICK_RATE = 20; // 서버 시뮬레이션 틱 (회/초)
export const TICK_MS = 1000 / TICK_RATE;

// ── 전투: 플레이어 ──────────────────────────────────────────
export const PLAYER_MAX_HP = 100;
export const PLAYER_MAX_MANA = 100;
export const MANA_REGEN = 12; // per second

// 기본 공격 (근접 부채꼴 스윙, 마나 무료)
export const BASIC_DMG = 12;
export const BASIC_RANGE = 95;
export const BASIC_HALF_ARC = 0.6; // 조준 방향 기준 ±각(라디안)
export const BASIC_CD = 0.4; // seconds

// 스킬 1 (조준 지점 광역 폭발)
export const SKILL_DMG = 34;
export const SKILL_RANGE = 300; // 시전 가능 최대 사거리
export const SKILL_RADIUS = 70; // 폭발 반경
export const SKILL_CD = 3.5; // seconds
export const SKILL_COST = 30; // mana

// ── 전투: 몹(연습용 더미) ───────────────────────────────────
export const DUMMY_MAX_HP = 400;
export const DUMMY_RADIUS = 28;
export const DUMMY_RESPAWN = 3; // seconds

// ── 클라 → 서버 메시지 ──────────────────────────────────────
export const MSG_INPUT = "input";
export const MSG_ATTACK = "attack"; // 기본 공격
export const MSG_SKILL = "skill"; // 스킬 1

/** 한 틱 동안의 이동 입력 (정규화 전, -1|0|1) */
export interface InputMessage {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  /** 클라이언트 입력 시퀀스 번호 (추후 예측/재조정용) */
  seq: number;
}

/** 조준 좌표 (월드 기준) — 공격/스킬에 사용 */
export interface AimMessage {
  aimX: number;
  aimY: number;
}

// ── 서버 → 클라 이벤트 (일회성 시각 효과) ───────────────────
export const EV_SWING = "swing"; // 기본 공격 스윙
export const EV_BLAST = "blast"; // 스킬 폭발
export const EV_DAMAGE = "damage"; // 대미지 숫자

export interface SwingEvent {
  x: number;
  y: number;
  angle: number; // 조준 방향
}
export interface BlastEvent {
  x: number;
  y: number;
}
export interface DamageEvent {
  x: number;
  y: number;
  amount: number;
}
