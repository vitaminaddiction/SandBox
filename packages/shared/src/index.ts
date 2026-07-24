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

// ── 클라 → 서버 입력 메시지 ─────────────────────────────────
export const MSG_INPUT = "input";

/** 한 틱 동안의 이동 입력 (정규화 전, -1|0|1) */
export interface InputMessage {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  /** 클라이언트 입력 시퀀스 번호 (추후 예측/재조정용) */
  seq: number;
}
