// Jugador en primera persona: movimiento con aceleración, salto, agacharse, colisiones contra el
// escenario y cámara con vaivén. La cámara la coloca Game a partir de `eyeY` y del cabeceo.

import * as THREE from "three";
import { groundHeightAt, resolveCircle, type Collider } from "../core/collision";
import { clamp, damp } from "../core/math";
import type { Input } from "../core/input";

export const PLAYER = {
  radius: 0.36,
  height: 1.78,
  crouchHeight: 1.24,
  eye: 1.62,
  crouchEye: 1.06,
  walk: 4.1,
  sprint: 6.3,
  crouchSpeed: 2.1,
  accel: 12,
  airAccel: 2.4,
  jump: 4.3,
  gravity: 15,
  stepUp: 0.55,
  maxHealth: 100,
} as const;

export class Player {
  readonly position = new THREE.Vector3(0, 0, 0);
  readonly velocity = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  onGround = true;
  crouching = false;
  sprinting = false;
  health: number = PLAYER.maxHealth;
  /** Abatido: en el suelo, arrastrándose despacio y con la pistola (la vida es 0 pero aún puede revivir). */
  downed = false;
  /** Vida máxima (Juggernog la sube). */
  maxHealth: number = PLAYER.maxHealth;
  /** Distancia recorrida acumulada (vaivén de cámara). */
  private travel = 0;
  /** Amplitud actual del vaivén, suavizada. */
  bobAmp = 0;
  /** Sacudida al recibir daño (rad) y su decaimiento. */
  shake = 0;
  /** Inclinación al moverse de lado (rad). */
  lean = 0;
  private stepDist = 0;
  onStep?: (running: boolean) => void;

  reset(x: number, z: number, yaw: number): void {
    this.position.set(x, 0, z);
    this.velocity.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = 0;
    this.health = this.maxHealth;
    this.downed = false;
    this.onGround = true;
    this.crouching = false;
    this.sprinting = false;
    this.travel = 0;
    this.bobAmp = 0;
    this.shake = 0;
    this.lean = 0;
  }

  get height(): number {
    return this.downed ? 0.7 : this.crouching ? PLAYER.crouchHeight : PLAYER.height;
  }

  get eyeY(): number {
    const base = this.downed ? 0.5 : this.crouching ? PLAYER.crouchEye : PLAYER.eye;
    return this.position.y + base + Math.sin(this.travel * 2.1) * 0.045 * this.bobAmp;
  }

  get alive(): boolean {
    return this.health > 0;
  }

  /** Dirección horizontal de la mirada (sin cabeceo). */
  forward(out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  eyePosition(out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(this.position.x, this.eyeY, this.position.z);
  }

  look(dx: number, dy: number, sensitivity: number): void {
    this.yaw -= dx * sensitivity * 0.0022;
    this.pitch = clamp(this.pitch - dy * sensitivity * 0.0022, -1.45, 1.45);
    if (this.yaw > Math.PI) this.yaw -= Math.PI * 2;
    if (this.yaw < -Math.PI) this.yaw += Math.PI * 2;
  }

  update(dt: number, input: Input, colliders: readonly Collider[]): void {
    if (!this.alive && !this.downed) {
      // Cuerpo en el suelo: solo cae.
      this.velocity.y -= PLAYER.gravity * dt;
      this.position.y = Math.max(0, this.position.y + this.velocity.y * dt);
      return;
    }
    const axis = input.moveAxis();
    this.crouching = !this.downed && (input.isDown("ControlLeft") || input.isDown("KeyC"));
    const forwardish = axis.z > 0.1;
    this.sprinting = !this.downed && input.isDown("ShiftLeft") && forwardish && !this.crouching;

    const speed = this.downed ? 1.0 : this.crouching ? PLAYER.crouchSpeed : this.sprinting ? PLAYER.sprint : PLAYER.walk;
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    // Adelante es (−sin, −cos); derecha es (cos, −sin).
    const wantX = (-sin * axis.z + cos * axis.x) * speed;
    const wantZ = (-cos * axis.z - sin * axis.x) * speed;
    const accel = this.onGround ? PLAYER.accel : PLAYER.airAccel;
    this.velocity.x = damp(this.velocity.x, wantX, accel, dt);
    this.velocity.z = damp(this.velocity.z, wantZ, accel, dt);

    // Salto con margen de suelo (coyote time corto).
    if (input.isDown("Space") && this.onGround && !this.downed) {
      this.velocity.y = PLAYER.jump;
      this.onGround = false;
    }
    this.velocity.y -= PLAYER.gravity * dt;

    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    this.position.y += this.velocity.y * dt;

    // Colisión horizontal: se ignoran suelos, techos y todo lo que se pueda pisar (escalón).
    resolveCircle(
      this.position,
      PLAYER.radius,
      this.position.y,
      this.position.y + this.height,
      colliders,
      (c) => c.tag === "floor" || c.tag === "ceiling" || c.max.y <= this.position.y + PLAYER.stepUp,
    );

    const floor = groundHeightAt(this.position.x, this.position.z, this.position.y, colliders, PLAYER.stepUp);
    if (floor !== null && this.velocity.y <= 0.01 && this.position.y <= floor + 0.12) {
      this.position.y = floor;
      this.velocity.y = 0;
      this.onGround = true;
    } else if (this.position.y > (floor ?? 0) + 0.02) {
      this.onGround = false;
    }
    if (this.position.y < -4) {
      // Salvaguarda: nunca se cae fuera del mundo.
      this.position.set(0, 0, 14);
      this.velocity.set(0, 0, 0);
    }

    // Vaivén: fase por distancia recorrida y amplitud por velocidad real.
    const hSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    const target = this.onGround ? clamp(hSpeed / PLAYER.sprint, 0, 1) * (this.crouching ? 0.4 : 1) : 0;
    this.bobAmp = damp(this.bobAmp, target, 8, dt);
    this.travel += hSpeed * dt * 1.55;
    this.stepDist += hSpeed * dt;
    if (this.stepDist > (this.sprinting ? 2.1 : 2.7)) {
      this.stepDist = 0;
      this.onStep?.(this.sprinting);
    }

    // Inclinación lateral suave (sin marear): sigue el eje de avance lateral, no la velocidad.
    this.lean = damp(this.lean, -axis.x * (this.sprinting ? 0.045 : 0.02), 6, dt);
    this.shake = Math.max(0, this.shake - dt * 2.6);
  }

  damage(amount: number): void {
    if (!this.alive) return;
    this.health = Math.max(0, this.health - amount);
    this.shake = Math.min(1, this.shake + amount / 45);
  }

  heal(amount: number): void {
    this.health = Math.min(this.maxHealth, this.health + amount);
  }
}
