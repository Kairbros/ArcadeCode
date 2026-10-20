// Vida, hambre y aire del jugador propio (supervivencia), como en el modo normal de Minecraft. Cada uno lleva
// los suyos en su equipo, como el inventario: el daño (caídas, ahogarse, hambre) y la comida no viajan por la
// red; el anfitrión solo sabe si alguien está muerto. Sin DOM ni WebGL (se usa en Node).
import type { Body } from "./player";

export const MAX_HEALTH = 20; // medios corazones
export const MAX_HUNGER = 20; // medios muslos
export const MAX_AIR = 10; // burbujas
export const SAFE_FALL = 3; // bloques que se pueden caer sin daño (luego, 1 por bloque)
export const EXHAUST_PER_POINT = 4; // cansancio que gasta un punto de hambre
export const IDLE_EXHAUST = 0.05; // por segundo, sin hacer nada (un punto cada 80 s)
export const WALK_EXHAUST = 0.03; // por bloque andado
export const JUMP_EXHAUST = 0.1;
export const ATTACK_EXHAUST = 0.1;
export const BREAK_EXHAUST = 0.025;
export const REGEN_HUNGER = 18; // con al menos esto de hambre se cura
export const REGEN_EVERY = 4; // un punto de vida cada tanto
export const REGEN_COST = 3; // cansancio por punto curado
export const STARVE_EVERY = 4; // con el hambre a 0, un punto de daño cada tanto (hasta dejar 1 de vida)
export const AIR_TIME = 1.2; // segundos bajo el agua por burbuja
export const DROWN_EVERY = 1;
export const DROWN_DAMAGE = 2;
export const HURT_FLASH = 0.5; // pantalla roja al recibir daño
export const EAT_TIME = 1.6; // segundos manteniendo el clic derecho para comer
export const RESPAWN_DELAY = 1; // muerto, cuánto hay que esperar para poder reaparecer

export class Vitals {
  health = MAX_HEALTH;
  hunger = MAX_HUNGER;
  /** Burbujas (con decimales; se dibujan redondeadas hacia arriba). */
  air = MAX_AIR;
  exhaustion = 0;
  /** Segundos que le quedan al destello rojo del último daño. */
  hurt = 0;
  /** Progreso al comer (segundos con el clic derecho mantenido). */
  eating = 0;
  private regen = 0;
  private starve = 0;
  private drown = 0;
  private falling = false;
  private peak = 0;

  get dead(): boolean {
    return this.health <= 0;
  }

  damage(n: number) {
    if (this.dead || !(n > 0)) return;
    this.health = Math.max(0, this.health - n);
    this.hurt = HURT_FLASH;
  }

  exhaust(x: number) {
    this.exhaustion += x;
    while (this.exhaustion >= EXHAUST_PER_POINT) {
      this.exhaustion -= EXHAUST_PER_POINT;
      this.hunger = Math.max(0, this.hunger - 1);
    }
  }

  eat(points: number) {
    this.hunger = Math.min(MAX_HUNGER, this.hunger + points);
  }

  /** Tras mover el cuerpo: caídas, aire, cansancio, curarse y pasar hambre. `walked` = bloques andados. */
  update(dt: number, b: Body, headInWater: boolean, walked: number) {
    this.hurt = Math.max(0, this.hurt - dt);
    if (this.dead) return;

    // Caída: desde el punto más alto en el aire hasta tocar suelo (el agua la frena del todo).
    if (b.inWater || b.flying) {
      this.falling = false;
    } else if (!b.ground) {
      if (!this.falling) this.peak = b.y;
      this.falling = true;
      this.peak = Math.max(this.peak, b.y);
    } else if (this.falling) {
      this.falling = false;
      const fall = this.peak - b.y;
      if (fall > SAFE_FALL) this.damage(Math.ceil(fall - SAFE_FALL));
    }

    // Aire: se gasta bajo el agua y, sin burbujas, se ahoga.
    if (headInWater) {
      this.air = Math.max(0, this.air - dt / AIR_TIME);
      if (this.air <= 0) {
        this.drown += dt;
        if (this.drown >= DROWN_EVERY) {
          this.drown = 0;
          this.damage(DROWN_DAMAGE);
        }
      }
    } else {
      this.air = Math.min(MAX_AIR, this.air + dt * 5);
      this.drown = 0;
    }

    this.exhaust(IDLE_EXHAUST * dt + WALK_EXHAUST * walked);

    if (this.hunger >= REGEN_HUNGER && this.health < MAX_HEALTH) {
      this.regen += dt;
      if (this.regen >= REGEN_EVERY) {
        this.regen = 0;
        this.health++;
        this.exhaust(REGEN_COST);
      }
    } else {
      this.regen = 0;
    }

    if (this.hunger <= 0) {
      this.starve += dt;
      if (this.starve >= STARVE_EVERY) {
        this.starve = 0;
        if (this.health > 1) this.damage(1);
      }
    } else {
      this.starve = 0;
    }
  }

  /** Vuelve a empezar (al reaparecer). */
  reset() {
    Object.assign(this, new Vitals());
  }
}
