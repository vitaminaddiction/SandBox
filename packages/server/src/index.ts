import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { RAID_ROOM, SERVER_PORT } from "@fellowship/shared";
import { RaidRoom } from "./rooms/RaidRoom.js";

const gameServer = new Server({
  transport: new WebSocketTransport(),
});

gameServer.define(RAID_ROOM, RaidRoom);

gameServer.listen(SERVER_PORT);
console.log(`⚔️  Fellowship Raid server listening on ws://localhost:${SERVER_PORT}`);
