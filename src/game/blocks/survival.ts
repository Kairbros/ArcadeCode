// Vida, aire y muerte del modo supervivencia. Solo cuenta lo que le pasa al jugador en su equipo:
// caídas, ahogarse y lo que le curen (manzanas). Sin hambre: se curó con comida a propósito.
export const MAX_HP = 20;
export const MAX_AIR = 12;
/** Puntos de hambre (10 muslos). */
export const MAX_HUNGER = 20;
export const RESPAWN_TIME = 2.4;

export interface Vitals {
  ground: boolean;
  /** Los pies en el agua (frena la caída y no hace daño). */
  inWater: boolean;
  /** La cabeza bajo el agua (se acaba el aire). */
  headWater: boolean;
  /** Velocidad vertical (para medir la caída). */
  vy: number;
  /** Corriendo: gasta más hambre. */
  sprinting?: boolean;
}

export class Survival {
  hp = MAX_HP;
  air = MAX_AIR;
  /** Puntos de hambre: a 0 se pierde vida; lleno, se recupera vida poco a poco. */
  hunger = MAX_HUNGER;
  /** Segundos que queda el parpadeo rojo de haberte hecho daño. */
  hurt = 0;
  /** Segundos que quedan de pantalla de muerte (0 = vivo). */
  deadT = 0;
  private fall = 0;
  private revive = false;

  get dead(): boolean {
    return this.deadT > 0;
  }

  update(dt: number, v: Vitals) {
    this.hurt = Math.max(0, this.hurt - dt);
    if (this.dead) {
      this.deadT = Math.max(0, this.deadT - dt);
      if (this.deadT === 0) {
        this.hp = MAX_HP;
        this.air = MAX_AIR;
        this.hunger = MAX_HUNGER;
        this.fall = 0;
        this.revive = true;
      }
      return;
    }
    // Caída: se acumula lo que baja, se borra al tocar suelo o agua.
    if (v.inWater) this.fall = 0;
    else if (!v.ground && v.vy < 0) this.fall += -v.vy * dt;
    if (v.ground) {
      if (this.fall > 3.5) this.hit(Math.floor(this.fall - 3));
      this.fall = 0;
    }
    // Aire
    if (v.headWater) {
      this.air = Math.max(0, this.air - dt);
      if (this.air === 0) this.hit(dt * 3);
    } else {
      this.air = Math.min(MAX_AIR, this.air + dt * 5);
    }
    // Hambre: se gasta andando y más corriendo; a 0 hace daño, llena cura poco a poco.
    const work = v.sprinting ? 0.06 : v.ground ? 0.02 : 0.012;
    this.hunger = Math.max(0, this.hunger - dt * work);
    if (this.hunger === 0) this.hit(dt * 1.5);
    else if (this.hunger > 16 && this.hp < MAX_HP) {
      this.hp = Math.min(MAX_HP, this.hp + dt * 0.35);
      this.hunger = Math.max(0, this.hunger - dt * 0.02);
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.deadT = RESPAWN_TIME;
    }
  }

  hit(n: number) {
    if (this.dead || n <= 0) return;
    this.hp = Math.max(0, this.hp - n);
    this.hurt = Math.max(this.hurt, 0.4);
    if (this.hp === 0) this.deadT = RESPAWN_TIME; // muere en el acto (el update cuenta atrás)
  }

  heal(n: number) {
    if (this.dead || n <= 0) return;
    this.hp = Math.min(MAX_HP, this.hp + n);
  }

  /** Come: llena hambre y cura. Devuelve false si no hacía falta (lleno del todo). */
  eat(food: number, heal = 0): boolean {
    if (this.dead) return false;
    const need = this.hunger < MAX_HUNGER || this.hp < MAX_HP;
    if (!need) return false;
    this.hunger = Math.min(MAX_HUNGER, this.hunger + food);
    this.heal(heal);
    return true;
  }

  /** ¿Toca reaparecer? (consume el aviso) */
  takeRevive(): boolean {
    if (!this.revive) return false;
    this.revive = false;
    return true;
  }

  reset() {
    this.hp = MAX_HP;
    this.air = MAX_AIR;
    this.hunger = MAX_HUNGER;
    this.hurt = 0;
    this.deadT = 0;
    this.fall = 0;
    this.revive = false;
  }
}
