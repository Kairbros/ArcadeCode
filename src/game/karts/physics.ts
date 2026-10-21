// Física del kart. La usan el anfitrión (su kart y la IA) y cada invitado (su propio kart),
// así cada uno conduce sin esperar a la red.
import {
  ACCEL, AIR_STEER, BOLT_FACTOR, BRAKE, COIN_R, COIN_SPEED, CURB_W, DRIFT_FOLLOW, DRIFT_MAX_SLIP, DRIFT_MIN_SPEED, DRIFT_TURN,
  DRIFT_TURN_IN, DRIFT_TURN_OUT, FRICTION, GRAVITY, HOP_TIME, KART_R, MAX_COINS, MAX_SPEED, MINI_TURBO_1, MINI_TURBO_2,
  MINI_TURBO_TIME_1, MINI_TURBO_TIME_2, OFFROAD_MAX, PAD_R, PAD_TIME, RAMP_LAUNCH, RAMP_LEN, RAMP_MIN_SPEED, REVERSE_MAX,
  DROP_TIME, FALL_DIST, FALL_LIMIT, RESPAWN_BACK, STAR_SPEED, STEER_RATE, TRACK_W, TRICK_BOOST, TUNNEL_LIMIT, TURBO_SPEED, WALL_MARGIN,
} from "./config";
import { SOLID_DECOS, locate, type StartSlot, type Track } from "./track";

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
  lap: number; // vuelta en la que está (las monedas reaparecen al empezar otra)
  hop: number; // saltito al empezar a derrapar
  drift: number; // 0 sin derrape, -1 izquierda, 1 derecha
  driftTime: number; // tiempo derrapando (carga del miniturbo)
  driftHeld: boolean; // la tecla de derrape estaba pulsada el frame anterior
  z: number; // altura sobre el suelo (saltos de rampa)
  vz: number;
  trick: boolean; // ha hecho un truco en el aire (turbo al aterrizar)
  trickT: number; // segundos desde el truco (para animarlo)
  star: number; // segundos de estrella (invencible)
  shrink: number; // segundos con el rayo encima (más lento)
  coins: number; // monedas recogidas (suben la velocidad máxima)
  taken: Uint8Array; // monedas ya cogidas (cada jugador ve y recoge las suyas)
  dist: number; // distancia a la línea central
  fall: boolean; // cayendo al vacío (espacio)
  safeSeg: number; // último tramo de pista pisado con seguridad
  drop: number; // segundos que quedan de Lakitu devolviendo al kart a la pista
}

export interface DriveInput {
  steer: number; // -1 izquierda .. 1 derecha
  throttle: number; // -1 freno/marcha atrás .. 1 acelerar
  drift: boolean; // tecla de derrape pulsada
}

export const NO_INPUT: DriveInput = { steer: 0, throttle: 0, drift: false };

export function makeKart(slot: StartSlot, coinCount = 0): Kart {
  return {
    x: slot.x, y: slot.y, a: slot.a, ma: slot.a, v: 0, seg: slot.seg, segT: 0, progress: slot.progress,
    spin: 0, turbo: 0, offroad: false, steerVis: 0, lap: 0, hop: 0, drift: 0, driftTime: 0, driftHeld: false,
    z: 0, vz: 0, trick: false, trickT: 0, star: 0, shrink: 0, coins: 0, taken: new Uint8Array(coinCount),
    dist: 0, fall: false, safeSeg: slot.seg, drop: 0,
  };
}

export function stepKart(k: Kart, input: DriveInput, track: Track, dt: number, canMove: boolean) {
  const control = canMove && k.spin <= 0;
  const air = k.z > 0 || k.fall;
  const steer = control ? input.steer * (air ? AIR_STEER : 1) : 0;
  const throttle = control && !air ? input.throttle : 0;
  const driftHeld = control && input.drift;
  k.steerVis += (steer - k.steerVis) * Math.min(1, dt * 10);
  k.star = Math.max(0, k.star - dt);
  k.shrink = Math.max(0, k.shrink - dt);
  if (k.trick) k.trickT += dt;
  k.drop = Math.max(0, k.drop - dt);

  if (air) stepAir(k, driftHeld, dt, track);
  else updateDrift(k, steer, driftHeld, dt);

  if (k.spin > 0) {
    k.spin -= dt;
    k.v *= Math.exp(-3 * dt);
  } else if (air) {
    // En el aire no se acelera ni se frena.
  } else if (throttle > 0) {
    k.v += ACCEL * throttle * dt;
  } else if (throttle < 0) {
    k.v -= (k.v > 0 ? BRAKE : ACCEL * 0.6) * -throttle * dt;
  } else {
    k.v -= Math.sign(k.v) * Math.min(Math.abs(k.v), FRICTION * dt);
  }
  if (k.turbo > 0) {
    k.turbo -= dt;
    if (k.spin <= 0 && throttle >= 0) k.v = Math.max(k.v, TURBO_SPEED); // frenar corta el turbo
  }
  const bonus = k.coins * COIN_SPEED;
  let max = k.star > 0 ? STAR_SPEED : k.turbo > 0 ? TURBO_SPEED : k.offroad && !air ? OFFROAD_MAX : MAX_SPEED + bonus;
  if (k.shrink > 0 && k.star <= 0) max *= BOLT_FACTOR;
  if (k.star > 0 && k.v < STAR_SPEED * 0.9 && !air && throttle > 0) k.v += ACCEL * dt; // la estrella empuja
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
  if (k.z < 10) collideDecos(k, track);
  updateTrackPosition(k, track, dt);
  if (track.theme.void) checkVoid(k);
  if (control) touchFeatures(k, track);
}

/** En el espacio, salirse del asfalto es caer; el último tramo seguro es donde Lakitu te devuelve. */
function checkVoid(k: Kart) {
  const onRoad = k.dist < TRACK_W / 2 - 2;
  // Cerca del borde de la cinta el kart roza y pierde algo de velocidad (como una barandilla de luz).
  if (!k.fall && k.dist > TRACK_W / 2 && k.z <= 0) k.v *= 0.995;
  if (!k.fall && k.z <= 0 && k.dist > FALL_DIST) {
    k.fall = true;
    k.vz = -10;
    k.drift = 0;
    k.driftTime = 0;
    k.turbo = 0;
  } else if (!k.fall && k.z <= 0 && onRoad) {
    k.safeSeg = k.seg;
  }
}

/** Lakitu recoge al kart: vuelve a la pista unos puntos antes de donde cayó, quieto y bajando en su nube. */
export function respawn(k: Kart, track: Track) {
  const n = track.n;
  const i = (((k.safeSeg - RESPAWN_BACK) % n) + n) % n;
  // El progreso retrocede lo que se retrocede en la pista; la búsqueda de tramo parte del punto nuevo.
  let back = i - (k.seg + k.segT);
  if (back > n / 2) back -= n;
  if (back < -n / 2) back += n;
  k.progress += back;
  k.seg = i;
  k.segT = 0;
  k.x = track.px[i];
  k.y = track.py[i];
  k.a = k.ma = track.dir[i];
  k.v = 0;
  k.z = 34;
  k.vz = 0;
  k.fall = false;
  k.spin = 0;
  k.turbo = 0;
  k.drift = 0;
  k.drop = DROP_TIME;
  updateTrackPosition(k, track, 0);
}

/** Salto: sube y baja; un truco en el aire (derrape) da turbo al aterrizar. */
function stepAir(k: Kart, held: boolean, dt: number, track: Track) {
  if (held && !k.driftHeld && !k.trick) {
    k.trick = true;
    k.trickT = 0;
  }
  k.driftHeld = held;
  k.drift = 0;
  k.driftTime = 0;
  k.vz -= GRAVITY * dt;
  k.z += k.vz * dt;
  if (k.fall) {
    if (k.z < FALL_LIMIT) respawn(k, track);
    return;
  }
  if (k.z <= 0) {
    // Aterrizar fuera del asfalto en el espacio: no hay suelo, se sigue cayendo.
    if (track.theme.void && k.dist > FALL_DIST) {
      k.fall = true;
      return;
    }
    k.z = 0;
    k.vz = 0;
    if (k.trick) k.turbo = Math.max(k.turbo, TRICK_BOOST);
    k.trick = false;
    k.trickT = 0;
  }
}

/** Lanza al kart por los aires (rampa o trampolín). */
export function launch(k: Kart, power: number) {
  k.vz = power;
  k.z = 0.01;
  k.trick = false;
  k.trickT = 0;
  k.hop = 0;
  k.drift = 0;
  k.driftTime = 0;
}

/** Rampas, placas de turbo y monedas del circuito: se notan al pasar por encima. */
function touchFeatures(k: Kart, track: Track) {
  const n = track.n;
  if (k.z <= 0 && !k.fall && !k.offroad && k.v > RAMP_MIN_SPEED) {
    for (const r of track.ramps) {
      const rel = (k.seg - r.i + n) % n;
      if (rel >= RAMP_LEN - 1 && rel <= RAMP_LEN) { // el labio de la rampa
        launch(k, RAMP_LAUNCH * Math.max(0.6, Math.min(1.3, k.v / MAX_SPEED)));
        break;
      }
    }
  }
  if (k.z <= 4 && k.z >= 0 && !k.fall) {
    for (const p of track.pads) {
      if (Math.abs(k.x - p.x) < PAD_R && Math.abs(k.y - p.y) < PAD_R && Math.hypot(k.x - p.x, k.y - p.y) < PAD_R) {
        k.turbo = Math.max(k.turbo, PAD_TIME);
      }
    }
  }
  const lap = Math.max(0, Math.floor(k.progress / n));
  if (lap > k.lap) {
    k.lap = lap;
    k.taken.fill(0); // las monedas vuelven a salir en cada vuelta
  }
  if (k.taken.length && k.coins < MAX_COINS) {
    track.coins.forEach((c, i) => {
      if (k.taken[i] || k.coins >= MAX_COINS) return;
      if (Math.abs(k.x - c.x) < COIN_R && Math.abs(k.y - c.y) < COIN_R && Math.hypot(k.x - c.x, k.y - c.y) < COIN_R) {
        k.taken[i] = 1;
        k.coins++;
      }
    });
  }
}

/** ¿Está el punto de la línea central i dentro de un túnel? */
export function inTunnel(track: Track, i: number): boolean {
  return track.tunnels.some((t) => i >= t.from && i <= t.to);
}

/** Árboles, cactus y rocas son sólidos: empujan fuera y frenan. */
function collideDecos(k: Kart, track: Track) {
  for (const d of track.decos) {
    if (!SOLID_DECOS.includes(d.kind)) continue;
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
  k.dist = loc.d;
  const limit = inTunnel(track, loc.i) ? TUNNEL_LIMIT : TRACK_W / 2 + WALL_MARGIN;
  if (loc.d > limit && !track.theme.void) {
    const nx = (k.x - loc.qx) / loc.d;
    const ny = (k.y - loc.qy) / loc.d;
    k.x = loc.qx + nx * limit;
    k.y = loc.qy + ny * limit;
    k.v *= Math.exp(-2.5 * dt); // rozar el muro frena, pero no en seco
  }
  k.offroad = loc.d > TRACK_W / 2 + CURB_W * 0.6 && !track.theme.void;

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
