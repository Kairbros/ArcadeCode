// Bloques creativo en red: directo y por relé con pérdidas.
import { runBlocksNet } from "./blocks-net";

runBlocksNet("blocks", "p2p", 60, 7);
runBlocksNet("blocks", "relay", 60, 8);
