// Constantes de Monigotes.

// --- Pantalla: vista lateral fija de todo el escenario ---
export const SW = 320;
export const SH = 200;
export const BLAST_Y = SH + 40; // por debajo de esto se cae del escenario
export const BLAST_X = 60; // margen lateral fuera de la pantalla

// --- Luchadores ---
export const FIGHTERS = 4; // los huecos sin jugador los ocupan bots (si están activados)
export const HP = 100;
export const BODY_H = 28; // altura de la caja de daño (de los pies a la cabeza)
export const BODY_HW = 6; // media anchura
export const GRAVITY = 900;
export const MAX_FALL = 420;
export const RUN_SPEED = 110;
export const GROUND_ACCEL = 1400;
export const AIR_ACCEL = 800;
export const GROUND_FRICTION = 1100;
export const AIR_DRAG = 2.2; // al salir despedido más rápido que corriendo
export const JUMP_V = 300;
export const DOUBLE_JUMP_V = 270;
export const HITSTUN = 0.22; // + daño/100
export const DROP_TIME = 0.25; // tiempo atravesando plataformas al pulsar abajo

// --- Ataques ---
export interface AttackSpec {
  range: number;
  damage: number;
  knock: number; // empuje horizontal
  lift: number; // empuje hacia arriba
  cooldown: number;
}
export const PUNCH: AttackSpec = { range: 16, damage: 9, knock: 80, lift: 80, cooldown: 0.32 };
export const KICK: AttackSpec = { range: 18, damage: 11, knock: 95, lift: 50, cooldown: 0.4 }; // en el aire
export const SWORD: AttackSpec = { range: 26, damage: 20, knock: 120, lift: 100, cooldown: 0.45 };
export const HIT_AT = 0.08; // el golpe cuerpo a cuerpo conecta este tiempo después de pulsar
export const ATTACK_ANIM = 0.22;
/** El empuje crece al perder vida: con poca vida se sale volando. */
export const KNOCK_SCALE = (hp: number) => 1 + (HP - Math.max(0, hp)) / 40;

// --- Armas ---
export const W_NONE = 0;
export const W_SWORD = 1;
export const W_PISTOL = 2;
export const W_BOMB = 3;
export type Weapon = 0 | 1 | 2 | 3;
export const AMMO: Record<Weapon, number> = { 0: 0, 1: 0, 2: 8, 3: 2 }; // espada: sin límite
export const BULLET_SPEED = 420;
export const BULLET_LIFE = 0.9;
export const BULLET_DAMAGE = 11;
export const BULLET_KNOCK = 60;
export const PISTOL_COOLDOWN = 0.28;
export const BOMB_FUSE = 1.4;
export const BOMB_RADIUS = 42;
export const BOMB_DAMAGE = 45;
export const BOMB_KNOCK = 240;
export const BOMB_COOLDOWN = 0.6;
export const EXPLOSION_TIME = 0.45;
export const CRATE_EVERY = 5; // segundos entre cajas de armas
export const MAX_CRATES = 2;

// --- Ronda ---
export const COUNTDOWN = 3;
export const ROUND_TIME = 90; // al acabar, empatan los que sigan en pie
export const END_DELAY = 1.5;
