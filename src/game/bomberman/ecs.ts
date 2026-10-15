// Mini ECS: entidades = ids, componentes = clases de datos, sistemas = objetos con update().
import type { SpatialIndex } from "./grid";
import type { MapData } from "./mapgen";

export type Entity = number;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ComponentType<T = unknown> = new (...args: any[]) => T;
type InstancesOf<T extends readonly ComponentType[]> = {
  [K in keyof T]: T[K] extends ComponentType<infer I> ? I : never;
};

export interface System {
  update(world: World, dt: number): void;
}

export class World {
  private nextId = 0;
  private entities = new Set<Entity>();
  private stores = new Map<ComponentType, Map<Entity, unknown>>();
  private pending = new Set<Entity>();
  /** Cambia con cada alta/baja estructural; lo usan los índices para invalidarse. */
  version = 0;

  // Recursos globales del mundo.
  mapInfo!: MapData;
  index!: SpatialIndex;

  private store<T>(type: ComponentType<T>): Map<Entity, T> {
    let s = this.stores.get(type);
    if (!s) {
      s = new Map();
      this.stores.set(type, s);
    }
    return s as Map<Entity, T>;
  }

  // --- entidades ---
  create(...components: object[]): Entity {
    const e = this.nextId++;
    this.entities.add(e);
    for (const c of components) this.store(c.constructor as ComponentType).set(e, c);
    this.version++;
    return e;
  }

  /** Crea una entidad con un id concreto (para reconstruir el mundo desde la red). */
  spawn(id: Entity, ...components: object[]): Entity {
    this.entities.add(id);
    for (const c of components) this.store(c.constructor as ComponentType).set(id, c);
    this.nextId = Math.max(this.nextId, id + 1);
    this.version++;
    return id;
  }

  /** Baja diferida: se aplica en flush(). */
  destroy(e: Entity) {
    if (this.entities.has(e) && !this.pending.has(e)) {
      this.pending.add(e);
      this.version++;
    }
  }

  alive(e: Entity): boolean {
    return this.entities.has(e) && !this.pending.has(e);
  }

  flush() {
    if (this.pending.size === 0) return;
    for (const e of this.pending) {
      this.entities.delete(e);
      for (const s of this.stores.values()) s.delete(e);
    }
    this.pending.clear();
    this.version++;
  }

  // --- componentes ---
  add(e: Entity, component: object) {
    this.store(component.constructor as ComponentType).set(e, component);
    this.version++;
  }

  remove(e: Entity, type: ComponentType) {
    if (this.store(type).delete(e)) this.version++;
  }

  get<T>(e: Entity, type: ComponentType<T>): T | undefined {
    if (this.pending.has(e)) return undefined;
    return this.store(type).get(e);
  }

  has(e: Entity, ...types: ComponentType[]): boolean {
    return !this.pending.has(e) && types.every((t) => this.store(t).has(e));
  }

  /** Devuelve [entidad, comp1, comp2, ...] de las entidades que tienen todos los tipos. */
  query<T extends ComponentType[]>(...types: T): [Entity, ...InstancesOf<T>][] {
    const stores = types.map((t) => this.store(t));
    const smallest = stores.reduce((a, b) => (b.size < a.size ? b : a));
    const result: [Entity, ...InstancesOf<T>][] = [];
    for (const e of [...smallest.keys()]) {
      if (this.pending.has(e)) continue;
      if (stores.every((s) => s.has(e))) {
        result.push([e, ...stores.map((s) => s.get(e))] as [Entity, ...InstancesOf<T>]);
      }
    }
    return result;
  }
}
