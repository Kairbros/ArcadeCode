// Física del kart. La usan el anfitrión (su kart y la IA) y cada invitado (su propio kart),
// así cada uno conduce sin esperar a la red.
import {
  ACCEL, BRAKE, CURB_W, DRIFT_FOLLOW, DRIFT_MAX_SLIP, DRIFT_MIN_SPEED, DRIFT_TURN, DRIFT_TURN_IN, DRIFT_TURN_OUT,
  FRICTION, HOP_TIME, KART_R, MAX_SPEED, MINI_TURBO_1, MINI_TURBO_2, MINI_TURBO_TIME_1, MINI_TURBO_TIME_2,
  OFFROAD_MAX, REVERSE_MAX, STEER_RATE, TRACK_W, TURBO_SPEED, WALL_MARGIN,
} from "./config";
import { locate, type StartSlot, type Track } from "./track";

export interface Kart {
  x: number;
  y: number;
  a: number; // hacia dónde apunta el kart (rad)
  ma: number; // hacia dónde se mueve: en un derrape se queda atrás respecto a `a`
  v: number; // velocidad (unidades/s)
  seg: number; // segmento de la línea central más cercano
  segT: number;
  progress: number; // puntos de línea central recorridos desde la meta (vueltas = progress / n)
  spin: number; // segundos de trompo restantes
  turbo: number; // segundos de turbo restantes
  offroad: boolean;
  steerVis: number; // giro suavizado, solo para dibujar
  hop: number; // saltito al empezar a derrapar
  drift: number; // 0 sin derrape, -1 izquierda, 1 derecha
  driftTime: number; // tiempo derrapando (carga del miniturbo)
  driftHeld: boolean; // la tecla de derrape estaba pulsada el frame anterior
}

export interface DriveInput {
  steer: number; // -1 izquierda .. 1 derecha
  throttle: number; // -1 freno/marcha atrás .. 1 acelerar
  drift: boolean; // tecla de derrape pulsada
}

export const NO_INPUT: DriveInput = { steer: 0, throttle: 0, drift: false };

export function makeKart(slot: StartSlot): Kart {
  return {
    x: slot.x, y: slot.y, a: slot.a, ma: slot.a, v: 0, seg: slot.seg, segT: 0, progress: slot.progress,
    spin: 0, turbo: 0, offroad: false, steerVis: 0, hop: 0, drift: 0, driftTime: 0, driftHeld: false,
  };
}

export function stepKart(k: Kart, input: DriveInput, track: Track, dt: number, canMove: boolean) {
  const control = canMove && k.spin <= 0;
  const steer = control ? input.steer : 0;
  const throttle = control ? input.throttle : 0;
  const driftHeld = control && input.drift;
  k.steerVis += (steer - k.steerVis) * Math.min(1, dt * 10);

  updateDrift(k, steer, driftHeld, dt);

  if (k.spin > 0) {
    k.spin -= dt;
    k.v *= Math.exp(-3 * dt);
  } else if (throttle > 0) {
    k.v += ACCEL * throttle * dt;
  } else if (throttle < 0) {
    k.v -= (k.v > 0 ? BRAKE : ACCEL * 0.6) * -throttle * dt;
  } else {
    k.v -= Math.sign(k.v) * Math.min(Math.abs(k.v), FRICTION * dt);
  }
  if (k.turbo > 0) {
    k.turbo -= dt;
    if (k.spin <= 0) k.v = Math.max(k.v, TURBO_SPEED);
  }
  const max = k.turbo > 0 ? TURBO_SPEED : k.offroad ? OFFROAD_MAX : MAX_SPEED;
  if (k.v > max) k.v = Math.max(max, k.v - 260 * dt); // fuera de pista frena poco a poco
  if (k.v < -REVERSE_MAX) k.v = -REVERSE_MAX;

  // El giro depende de la velocidad: parado no gira; marcha atrás invierte.
  const grip = Math.max(-1, Math.min(1, k.v / 70));
  if (k.drift) {
    // Derrapando gira siempre hacia su lado: hacia dentro cierra la curva, hacia fuera la abre.
    const into = steer * k.drift; // 1 cerrando, -1 abriendo
    const turn = into >= 0 ? DRIFT_TURN + (DRIFT_TURN_IN - DRIFT_TURN) * into : DRIFT_TURN + (DRIFT_TURN - DRIFT_TURN_OUT) * into;
    k.a += k.drift * STEER_RATE * turn * grip * dt;
  } else {
    k.a += steer * STEER_RATE * grip * dt;
  }
  // La dirección de avance persigue al morro: enseguida con agarre y algo más despacio derrapando,
  // así el kart va un poco cruzado (como mucho DRIFT_MAX_SLIP).
  if (k.spin <= 0) {
    k.ma += wrapAngle(k.a - k.ma) * Math.min(1, dt * (k.drift ? DRIFT_FOLLOW : 14));
    const slip = wrapAngle(k.a - k.ma);
    if (k.drift && Math.abs(slip) > DRIFT_MAX_SLIP) k.ma = k.a - Math.sign(slip) * DRIFT_MAX_SLIP;
  }
  k.x += Math.cos(k.ma) * k.v * dt;
  k.y += Math.sin(k.ma) * k.v * dt;
  collideDecos(k, track);
  updateTrackPosition(k, track, dt);
}

/** Árboles, cactus y rocas son sólidos: empujan fuera y frenan. */
function collideDecos(k: Kart, track: Track) {
  for (const d of track.decos) {
    const dx = k.x - d.x;
    const dy = k.y - d.y;
    const min = KART_R + 4 * d.size;
    if (Math.abs(dx) > min || Math.abs(dy) > min) continue;
    const dist = Math.hypot(dx, dy);
    if (dist >= min || dist < 0.01) continue;
    k.x = d.x + (dx / dist) * min;
    k.y = d.y + (dy / dist) * min;
    k.v *= 0.5;
    k.drift = 0;
  }
}

/** Saltito al pulsar derrape; si al caer se está girando, empieza el derrape. Al soltar: miniturbo. */
function updateDrift(k: Kart, steer: number, held: boolean, dt: number) {
  if (held && !k.driftHeld && k.hop <= 0 && !k.drift && k.v > 20) k.hop = HOP_TIME;
  k.driftHeld = held;
  if (k.hop > 0) {
    k.hop -= dt;
    if (k.hop <= 0 && held && steer !== 0 && k.v > DRIFT_MIN_SPEED) {
      k.drift = Math.sign(steer);
      k.driftTime = 0;
    }
  }
  if (!k.drift) return;
  if (held && k.v > DRIFT_MIN_SPEED * 0.8 && k.spin <= 0) {
    k.driftTime += dt;
    return;
  }
  // Fin del derrape: solo da miniturbo si se suelta a propósito (no por frenar o recibir un golpe).
  if (!held && k.spin <= 0) {
    if (k.driftTime > MINI_TURBO_2) k.turbo = Math.max(k.turbo, MINI_TURBO_TIME_2);
    else if (k.driftTime > MINI_TURBO_1) k.turbo = Math.max(k.turbo, MINI_TURBO_TIME_1);
  }
  k.drift = 0;
  k.driftTime = 0;
}

/** Nivel de carga del miniturbo: 0 nada, 1 azul, 2 naranja. */
export function driftCharge(k: { drift: number; driftTime: number }): number {
  if (!k.drift) return 0;
  return k.driftTime > MINI_TURBO_2 ? 2 : k.driftTime > MINI_TURBO_1 ? 1 : 0;
}

/** Recalcula segmento, progreso, si está fuera de pista y el muro invisible. */
export function updateTrackPosition(k: Kart, track: Track, dt = 0) {
  const loc = locate(track, k.x, k.y, k.seg);
  const limit = TRACK_W / 2 + WALL_MARGIN;
  if (loc.d > limit) {
    const nx = (k.x - loc.qx) / loc.d;
    const ny = (k.y - loc.qy) / loc.d;
    k.x = loc.qx + nx * limit;
    k.y = loc.qy + ny * limit;
    k.v *= Math.exp(-2.5 * dt); // rozar el muro frena, pero no en seco
  }
  k.offroad = loc.d > TRACK_W / 2 + CURB_W * 0.6;

  const n = track.n;
  let delta = loc.i + loc.t - (k.seg + k.segT);
  if (delta > n / 2) delta -= n;
  if (delta < -n / 2) delta += n;
  k.progress += delta;
  k.seg = loc.i;
  k.segT = loc.t;
}

/** Empuja al kart k fuera de los demás (cada uno solo se mueve a sí mismo). */
export function bump(k: Kart, others: { x: number; y: number }[]) {
  for (const o of others) {
    const dx = k.x - o.x;
    const dy = k.y - o.y;
    const d = Math.hypot(dx, dy);
    const min = KART_R * 2;
    if (d > 0.01 && d < min) {
      const push = (min - d) * 0.6;
      k.x += (dx / d) * push;
      k.y += (dy / d) * push;
      k.v *= 0.97;
    }
  }
}

export function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
