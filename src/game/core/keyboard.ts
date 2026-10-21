export function isTyping(ev: Event): boolean {
  return ev.target instanceof HTMLInputElement || ev.target instanceof HTMLTextAreaElement;
}

/** Estado del teclado por KeyboardEvent.code. Separado del juego para poder sustituirlo por input remoto. */
export class Keyboard {
  private down = new Set<string>();

  constructor(target: Window, private captured: Set<string>) {
    target.addEventListener("keydown", (ev) => {
      if (isTyping(ev)) return; // escribiendo el código de sala
      if (this.captured.has(ev.code)) ev.preventDefault(); // flechas/espacio no hacen scroll
      this.down.add(ev.code);
    });
    target.addEventListener("keyup", (ev) => this.down.delete(ev.code));
    target.addEventListener("blur", () => this.down.clear());
  }

  isDown(code: string): boolean {
    return this.down.has(code);
  }

  anyDown(codes: readonly string[]): boolean {
    return codes.some((c) => this.down.has(c));
  }
}
