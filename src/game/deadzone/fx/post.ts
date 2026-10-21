// Postproceso de Dead Zone sobre el renderizador compartido del hub: escena en HDR con MSAA, resplandor (bloom)
// en lo más brillante (fuego, ojos, luna, armas mejoradas), y un pase de «look zombi»: aberración cromática
// en los bordes (más fuerte al recibir daño), colores apagados con luces cálidas y sombras frías, viñeta, pantalla
// que se tiñe de sangre con poca vida, relámpagos y grano de película. Al final, mapa de tonos y sRGB.
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

export interface PostState {
  time: number;
  /** 1 al recibir un golpe y baja a 0. */
  damage: number;
  /** 0..1: cuánto falta de vida (empieza a notarse bajo la mitad). */
  low: number;
  /** Relámpago 0..1. */
  flash: number;
  /** Apuntando (0..1): la viñeta se cierra un poco. */
  ads: number;
  /** Corriendo (0..1). */
  sprint: number;
}

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uDamage: { value: 0 },
    uLow: { value: 0 },
    uFlash: { value: 0 },
    uAds: { value: 0 },
    uSprint: { value: 0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uTime, uDamage, uLow, uFlash, uAds, uSprint;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 c = vUv - 0.5;
      float r2 = dot(c, c);
      // Aberración cromática: crece hacia los bordes, con el daño y al correr.
      float ab = (0.0009 + uDamage * 0.007 + uSprint * 0.0012) * r2 * 4.0;
      vec3 col = vec3(
        texture2D(tDiffuse, vUv + c * ab).r,
        texture2D(tDiffuse, vUv).g,
        texture2D(tDiffuse, vUv - c * ab).b
      );
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      // Colores apagados (más con poca vida), sombras frías y luces cálidas.
      col = mix(vec3(l), col, 1.0 - (0.16 + uLow * 0.5));
      col *= mix(vec3(0.9, 1.0, 1.1), vec3(1.1, 1.0, 0.9), smoothstep(0.02, 0.9, l));
      col = max((col - 0.16) * 1.1 + 0.16, 0.0);
      // Viñeta.
      float vig = smoothstep(0.1, 0.62, r2) * (0.75 + uLow * 0.5 + uAds * 0.35);
      col *= 1.0 - vig * 0.62;
      // Borde rojo: el golpe recibido y el latido de la poca vida.
      float edge = smoothstep(0.06, 0.5, r2);
      float pulse = uLow * (0.55 + 0.45 * sin(uTime * 6.5));
      col = mix(col, vec3(0.5, 0.0, 0.0) * (0.25 + l * 0.6), edge * clamp(uDamage * 0.9 + pulse * 0.45, 0.0, 0.92));
      col += uFlash * vec3(0.07, 0.085, 0.14);
      // Grano.
      float g = hash(vUv * vec2(1920.0, 1080.0) + fract(uTime) * 61.0) - 0.5;
      col += g * 0.03 * (1.1 - l);
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }`,
};

export class PostFx {
  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private readonly grade: ShaderPass;
  private w = 0;
  private h = 0;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, w: number, h: number) {
    const target = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, target);
    this.composer.setPixelRatio(1);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(Math.max(64, w >> 1), Math.max(64, h >> 1)), 0.62, 0.55, 1.05);
    this.composer.addPass(this.bloom);
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
    this.resize(w, h);
  }

  /** Calidad: muestras de MSAA del buffer HDR y si hay resplandor (bloom). */
  setQuality(samples: number, bloom: boolean): void {
    this.bloom.enabled = bloom;
    for (const rt of [this.composer.renderTarget1, this.composer.renderTarget2]) {
      if (rt.samples === samples) continue;
      rt.samples = samples;
      rt.dispose();
    }
  }

  resize(w: number, h: number): void {
    if (w === this.w && h === this.h) return;
    this.w = w;
    this.h = h;
    this.composer.setSize(w, h);
    this.bloom.setSize(Math.max(64, w >> 1), Math.max(64, h >> 1));
  }

  render(dt: number, s: PostState): void {
    const u = this.grade.uniforms;
    u.uTime.value = s.time;
    u.uDamage.value = s.damage;
    u.uLow.value = s.low;
    u.uFlash.value = s.flash;
    u.uAds.value = s.ads;
    u.uSprint.value = s.sprint;
    this.composer.render(dt);
  }

  dispose(): void {
    this.composer.dispose();
    this.bloom.dispose();
  }
}
