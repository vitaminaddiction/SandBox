import { Room, Client } from "colyseus";
import { Schema, MapSchema, type } from "@colyseus/schema";
import {
  InputMessage,
  MSG_INPUT,
  PLAYER_RADIUS,
  PLAYER_SPEED,
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

  // 서버에서만 쓰는 최신 입력 (동기화하지 않음)
  input: InputMessage = { up: false, down: false, left: false, right: false, seq: 0 };
}

/** 레이드 룸 전체 상태 */
export class RaidState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();
}

const clamp = (v: number, min: number, max: number) =>
  v < min ? min : v > max ? max : v;

export class RaidRoom extends Room<RaidState> {
  maxClients = 10;

  onCreate() {
    this.setState(new RaidState());

    // 권한 서버: 일정한 틱으로 시뮬레이션
    this.setSimulationInterval((dt) => this.update(dt), TICK_MS);

    this.onMessage(MSG_INPUT, (client, input: InputMessage) => {
      const player = this.state.players.get(client.sessionId);
      if (player) player.input = input;
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

  /** 모든 플레이어 이동을 서버에서 계산 */
  private update(dtMs: number) {
    const dt = dtMs / 1000;
    this.state.players.forEach((player) => {
      const i = player.input;
      let dx = (i.right ? 1 : 0) - (i.left ? 1 : 0);
      let dy = (i.down ? 1 : 0) - (i.up ? 1 : 0);

      // 대각선 이동 속도 보정
      if (dx !== 0 && dy !== 0) {
        const inv = 1 / Math.SQRT2;
        dx *= inv;
        dy *= inv;
      }

      player.x = clamp(player.x + dx * PLAYER_SPEED * dt, PLAYER_RADIUS, WORLD_WIDTH - PLAYER_RADIUS);
      player.y = clamp(player.y + dy * PLAYER_SPEED * dt, PLAYER_RADIUS, WORLD_HEIGHT - PLAYER_RADIUS);
    });
  }
}
