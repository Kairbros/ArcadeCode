// Componentes: solo datos, nada de lógica.
import type { RGB } from "./config";
import type { Entity } from "./ecs";
import type { IntentSource } from "./input";

export enum PowerUpKind {
  Speed = "speed", // más velocidad
  Range = "range", // más rango de explosión
  Bombs = "bombs", // más bombas simultáneas
}
export const POWERUP_KINDS = [PowerUpKind.Speed, PowerUpKind.Range, PowerUpKind.Bombs];

export type Dir = readonly [number, number];

// --- Posición / física ---
/** Posición continua (centro, en píxeles de mundo). */
export class Transform {
  constructor(public x: number, public y: number) {}
}

/** Posición fija en la rejilla (muros, cajas, bombas, llamas, buffs). */
export class GridCell {
  constructor(public col: number, public row: number) {}
}

export class Collider {
  constructor(public half: number) {} // medio lado de la caja de colisión
}

export class Movement {
  facing: Dir = [0, 1];
  moving = false;
  blocked = false;
  constructor(public speed: number) {}
}

/** Bloquea el movimiento. */
export class Solid {}

// --- Control ---
/** Lo que la entidad quiere hacer este frame (lo rellena input o IA). */
export class Intent {
  dx = 0;
  dy = 0;
  alt: Dir | null = null; // dirección alternativa si la principal está bloqueada
  placeBomb = false;
}

export class PlayerControl {
  constructor(public source: IntentSource) {}
}

export class Player {
  alive = true;
  constructor(public index: number, public name: string) {}
}

export class Enemy {
  dx = 0;
  dy = 0;
  timer = 0;
}

// --- Bombas ---
export class BombBag {
  active = 0;
  constructor(public capacity: number, public range: number) {}
}

export class Bomb {
  constructor(
    public owner: Entity,
    public timer: number,
    public range: number,
    public passable: Set<Entity>, // entidades que aún pueden salir de encima
  ) {}
}

export type ExplosionShape = "center" | "arm" | "end";

export class Explosion {
  constructor(public shape: ExplosionShape, public direction: Dir, public duration: number) {}
}

// --- Mapa ---
/** Indestructible: corta las explosiones. */
export class Wall {}

export class Destructible {
  constructor(public loot: PowerUpKind | null = null) {}
}

export class Burning {
  constructor(public timer: number) {}
}

export class PowerUp {
  constructor(public kind: PowerUpKind) {}
}

// --- Vida / efectos ---
/** Muere al tocar una explosión. */
export class Killable {}

export class Dying {
  constructor(public timer: number) {}
}

export class Lifetime {
  constructor(public remaining: number) {}
}

export class FloatingText {
  constructor(public text: string, public color: RGB, public duration: number) {}
}

// --- Render ---
export type SpriteKind = "wall" | "crate" | "bomb" | "explosion" | "powerup" | "player" | "enemy" | "text";

export class Sprite {
  constructor(public kind: SpriteKind, public layer = 0, public color: RGB = [255, 255, 255]) {}
}
