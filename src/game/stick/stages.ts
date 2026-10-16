// Escenarios de Monigotes: plataformas (se atraviesan desde abajo) y puntos de aparición.
import type { RGB } from "../core/config";

export interface Platform {
  x: number;
  y: number; // borde superior
  w: number;
  /** Suelo principal: no se puede atravesar hacia abajo. */
  solid: boolean;
}

export interface Stage {
  name: string;
  platforms: Platform[];
  spawns: [number, number][];
  skyTop: RGB;
  skyBottom: RGB;
  city: RGB;
}

const p = (x: number, y: number, w: number, solid = false): Platform => ({ x, y, w, solid });

export const STAGES: Stage[] = [
  {
    name: "Puente",
    platforms: [p(50, 168, 220, true), p(20, 122, 80), p(220, 122, 80), p(125, 84, 70)],
    spawns: [[80, 168], [240, 168], [60, 122], [260, 122]],
    skyTop: [40, 50, 90], skyBottom: [230, 140, 110], city: [50, 45, 70],
  },
  {
    name: "Torres",
    platforms: [p(20, 160, 70, true), p(125, 176, 70, true), p(230, 160, 70, true), p(70, 110, 60), p(190, 110, 60), p(130, 64, 60)],
    spawns: [[55, 160], [265, 160], [100, 110], [220, 110]],
    skyTop: [20, 24, 50], skyBottom: [90, 70, 140], city: [30, 30, 55],
  },
  {
    name: "Escalones",
    platforms: [p(30, 170, 120, true), p(170, 170, 120, true), p(110, 128, 100), p(30, 90, 70), p(220, 90, 70), p(135, 50, 50)],
    spawns: [[60, 170], [260, 170], [60, 90], [255, 90]],
    skyTop: [70, 140, 200], skyBottom: [200, 230, 240], city: [90, 120, 150],
  },
];
