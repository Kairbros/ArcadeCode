// Dead Zone: cada puerta comprable se ve, se compra desde los dos lados y se puede cruzar después.
import { check } from "./lib";
import * as THREE from "three";
import { Keyboard } from "../src/game/core/keyboard";
import { DeadZoneHost } from "../src/game/deadzone/game";
import { Input } from "../src/game/deadzone/core/input";

const kb = { isDown: () => false, anyDown: () => false } as unknown as Keyboard;
console.log("Puertas");
const host = new DeadZoneHost(new Input(kb), 0, "local");
host.rounds.state = "intermission" as never;
host.rounds.timer = 9999;
const s = host.seats[0];
const world = host.stage.map;
for (const d of world.doors) {
  for (const side of [1, -1]) {
    // Se coloca a 1,4 m de la puerta por un lado, mirando hacia ella.
    const px = d.x + d.nx * side * 1.4;
    const pz = d.z + d.nz * side * 1.4;
    s.p.reset(px, pz, 0);
    s.p.yaw = Math.atan2(d.nx * side, d.nz * side);
    s.points.reset(5000);
    d.open = false;
    d.collider.enabled = true;
    host.interact.reset();
    const eye = s.p.eyePosition();
    const fwd = s.p.forward(new THREE.Vector3());
    const prompt = host.interact.find(eye, fwd, s, 0);
    check(prompt?.kind === "door" && prompt.id === d.id, `${d.id} (lado ${side}): sale el cartel de abrir`, prompt ? `${prompt.kind}:${prompt.id}` : "ninguno");
    if (prompt?.kind === "door") {
      host.interact.use(prompt, 0, s);
      check(d.open && !d.collider.enabled, `${d.id} (lado ${side}): se abre al comprarla`);
    }
    // Camina hacia el otro lado con el mando al frente.
    const walk = { moveAxis: () => ({ x: 0, z: 1 }), isDown: (c: string) => c === "KeyW", mouseLeft: false } as unknown as Input;
    for (let i = 0; i < 180; i++) s.p.update(1 / 60, walk, world.colliders);
    const dist = Math.hypot(s.p.position.x - d.x, s.p.position.z - d.z);
    const across = (s.p.position.x - d.x) * d.nx * side + (s.p.position.z - d.z) * d.nz * side;
    check(across < -0.5, `${d.id} (lado ${side}): se puede cruzar`, `a ${dist.toFixed(2)} m, lado ${across.toFixed(2)}`);
  }
}
host.dispose();

console.log("Zombi atascado");
{
  const h = new DeadZoneHost(new Input(kb), 0, "local");
  h.rounds.state = "intermission" as never;
  h.rounds.timer = 99999;
  h.stage.zombies.clear();
  // Encerrado en la armería (puerta cerrada) mientras el jugador espera en el patio: no hay ruta posible.
  const z = h.stage.zombies.spawn("walker", 1, 18, -18);
  z.state = "chasing";
  let moved = 0; // mayor salto en un solo fotograma (el rescate lo coloca en otro punto de golpe)
  for (let i = 0; i < 30 * 45; i++) {
    const px = z.position.x;
    const pz = z.position.z;
    h.seats[0].p.health = 100;
    h.update(1 / 30);
    moved = Math.max(moved, Math.hypot(z.position.x - px, z.position.z - pz));
  }
  check(moved > 8, "un zombi sin ruta durante rato se coloca en otro sitio con camino hasta el jugador", `salto de ${moved.toFixed(1)} m`);
  check(z.stuckT < 12, "y vuelve a perseguir", `${z.stuckT.toFixed(1)}`);
  h.dispose();
}
