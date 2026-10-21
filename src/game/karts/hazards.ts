// Peligros del circuito (como los de Mario Kart): chomps que cruzan la pista, thwomps que caen a golpes y
// meteoros que la barren. Su posición sale solo del tiempo de carrera, así el anfitrión (que decide los
// golpes) y los invitados (que los dibujan) los ven en el mismo sitio sin mandarlos por la red.
import { CHOMP_R, KART_R } from "./config";
import type { Hazard, Track } from "./track";

export interface HazardState {
  x: number;
  y: number;
  /** Altura sobre la pista (unidades). */
  z: number;
  /** Rumbo hacia el que mira (rad, del juego). */
  face: number;
  /** ¿Hace daño ahora? (el thwomp solo cuando está abajo). */
  deadly: boolean;
  /** Radio (círculo) o semilados along/lat (caja, solo el thwomp). */
  r: number;
  box?: { along: number; lat: number };
  /** Thwomp: 0 arriba … 1 abajo (para la sombra del suelo). */
  drop: number;
  /** Chomp: punto donde está clavada la cadena. */
  anchor: { x: number; y: number };
}

export const THWOMP_CYCLE = 4.2;
const THWOMP_UP = 46;

/** Coordenadas del mundo a partir de las de la pista (along = hacia delante, lat = a la derecha). */
function place(track: Track, i: number, along: number, lat: number): { x: number; y: number } {
  const d = track.dir[i];
  return {
    x: track.px[i] + Math.cos(d) * along - Math.sin(d) * lat,
    y: track.py[i] + Math.sin(d) * along + Math.cos(d) * lat,
  };
}

export function hazardAt(track: Track, h: Hazard, time: number): HazardState {
  const d = track.dir[h.i];
  const anchor = place(track, h.i, 0, 0);
  if (h.kind === "thwomp") {
    const lat = [-17, 0, 17][Math.floor(h.phase * 7) % 3];
    const p = (time + h.phase) % THWOMP_CYCLE;
    // Arriba parado, golpe rápido, abajo un momento y vuelve a subir despacio.
    const z = p < 2.4 ? THWOMP_UP : p < 2.55 ? THWOMP_UP * (1 - (p - 2.4) / 0.15) : p < 3.2 ? 0 : THWOMP_UP * ((p - 3.2) / 1.0);
    const pos = place(track, h.i, 0, lat);
    return { ...pos, z, face: d, deadly: z < 12, r: 17, box: { along: 15, lat: 17 }, drop: 1 - z / THWOMP_UP, anchor };
  }
  const meteor = h.kind === "meteor";
  const w = meteor ? 0.8 : 1.1;
  const a = time * w + h.phase;
  const lat = Math.sin(a) * (meteor ? 40 : 34);
  const along = meteor ? Math.cos(a) * 20 : Math.sin(time * 2.3 + h.phase) * 8;
  const pos = place(track, h.i, along, lat);
  // Mira hacia donde va (a derecha o izquierda de la pista).
  const face = d + (Math.cos(a) * w >= 0 ? Math.PI / 2 : -Math.PI / 2);
  return { ...pos, z: meteor ? 10 : 9, face, deadly: true, r: meteor ? 9 : CHOMP_R, drop: 0, anchor };
}

/** ¿Toca este peligro (ahora) a un kart en (x, y) a altura z? */
export function hazardHits(track: Track, h: Hazard, st: HazardState, x: number, y: number, z: number): boolean {
  if (!st.deadly || z > 12 || z < -2) return false;
  if (st.box) {
    const d = track.dir[h.i];
    const dx = x - st.x, dy = y - st.y;
    const along = dx * Math.cos(d) + dy * Math.sin(d);
    const lat = -dx * Math.sin(d) + dy * Math.cos(d);
    return Math.abs(along) < st.box.along + KART_R * 0.5 && Math.abs(lat) < st.box.lat + KART_R * 0.5;
  }
  return Math.hypot(x - st.x, y - st.y) < st.r + KART_R;
}
