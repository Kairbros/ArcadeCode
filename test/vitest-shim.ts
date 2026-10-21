// Un mini «vitest» para las pruebas portadas de Dead Zone: describe / it / expect sobre las comprobaciones del hub.
import { check } from "./lib";

let prefix = "";
export function describe(name: string, fn: () => void): void {
  console.log(name);
  const old = prefix;
  prefix = name;
  fn();
  prefix = old;
}

export function it(name: string, fn: () => void): void {
  try {
    fn();
    check(true, name);
  } catch (err) {
    check(false, name, err instanceof Error ? err.message : String(err));
  }
}

class Expect {
  constructor(private v: unknown, private neg = false) {}
  get not(): Expect {
    return new Expect(this.v, !this.neg);
  }
  private ok(cond: boolean, msg: string): void {
    if (cond === this.neg) throw new Error(`${this.neg ? "no " : ""}${msg} (valor: ${JSON.stringify(this.v)})`);
  }
  toBe(x: unknown) { this.ok(Object.is(this.v, x), `debía ser ${JSON.stringify(x)}`); }
  toBeNull() { this.ok(this.v === null, "debía ser null"); }
  toBeTruthy() { this.ok(!!this.v, "debía ser verdadero"); }
  toBeCloseTo(x: number, digits = 2) { this.ok(Math.abs((this.v as number) - x) < Math.pow(10, -digits) / 2, `debía estar cerca de ${x}`); }
  toBeGreaterThan(x: number) { this.ok((this.v as number) > x, `debía ser > ${x}`); }
  toBeGreaterThanOrEqual(x: number) { this.ok((this.v as number) >= x, `debía ser ≥ ${x}`); }
  toBeLessThan(x: number) { this.ok((this.v as number) < x, `debía ser < ${x}`); }
  toBeLessThanOrEqual(x: number) { this.ok((this.v as number) <= x, `debía ser ≤ ${x}`); }
}

export const expect = (v: unknown) => new Expect(v);
