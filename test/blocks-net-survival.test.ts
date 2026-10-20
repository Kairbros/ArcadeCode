// Bloques supervivencia en red: mundo, inventarios y objetos del suelo cuadran, directo y por relé con pérdidas.
import { runBlocksNet } from "./blocks-net";

runBlocksNet("survival", "p2p", 120, 11);
runBlocksNet("survival", "relay", 120, 12);
