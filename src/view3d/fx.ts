/**
 * Efectos de legibilidad:
 *  - "Agujero" de transparencia: lo que queda por delante del cursor (o del edificio seleccionado) se dibuja
 *    tramado dentro de un círculo, para ver y seleccionar lo que tapa. Vale para mallas instanciadas y con esqueleto.
 *  - Contorno: un pase a pantalla completa que oscurece los saltos de profundidad (siluetas y escalones).
 */
import * as THREE from 'three';
import { OUTLINE_COLOR } from './palette';

/** xy = centro en píxeles del búfer (origen abajo-izquierda), z = radio en píxeles (0 = apagado), w = profundidad límite. */
export const HOLES = {
  a: { value: new THREE.Vector4(0, 0, 0, 0) },
  b: { value: new THREE.Vector4(0, 0, 0, 0) },
};

const HOLE_GLSL = `
uniform vec4 uHoleA;
uniform vec4 uHoleB;
bool inHole(vec4 h) {
  vec2 d = gl_FragCoord.xy - h.xy;
  return h.z > 0.0 && dot(d, d) < h.z * h.z && gl_FragCoord.z < h.w;
}
`;
const HOLE_TEST = `
if (inHole(uHoleA) || inHole(uHoleB)) {
  // Trama 2x2: se queda 1 de cada 4 píxeles (≈ 25 % de opacidad) sin ordenar transparencias.
  if (mod(floor(gl_FragCoord.x), 2.0) + mod(floor(gl_FragCoord.y), 2.0) > 0.5) discard;
}
`;

const patched = new WeakSet<THREE.Material>();
/** Añade el agujero de transparencia a un material (una sola vez). */
export function patchMaterial(m: THREE.Material): void {
  if (patched.has(m)) return;
  patched.add(m);
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uHoleA = HOLES.a;
    shader.uniforms.uHoleB = HOLES.b;
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', `${HOLE_GLSL}\nvoid main() {`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n${HOLE_TEST}`);
  };
  m.customProgramCacheKey = () => 'hole';
}

/** Dibuja la escena a una textura con profundidad y la compone con el contorno. */
export class OutlinePass {
  enabled = true;
  private target: THREE.WebGLRenderTarget;
  private quadScene = new THREE.Scene();
  private quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private mat: THREE.ShaderMaterial;

  constructor(private renderer: THREE.WebGLRenderer) {
    this.target = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
    this.target.depthTexture = new THREE.DepthTexture(4, 4);
    this.target.depthTexture.type = THREE.UnsignedIntType;
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: this.target.texture },
        tDepth: { value: this.target.depthTexture },
        texel: { value: new THREE.Vector2(1, 1) },
        range: { value: 1 },
        lineColor: { value: new THREE.Color(OUTLINE_COLOR) },
        strength: { value: 0.85 },
        edge: { value: new THREE.Vector2(0.13, 0.36) },
        uHoleA: HOLES.a,
        uHoleB: HOLES.b,
      },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `
        uniform sampler2D tColor; uniform sampler2D tDepth; uniform vec2 texel; uniform float range; uniform vec3 lineColor; uniform float strength; uniform vec2 edge;
        uniform vec4 uHoleA; uniform vec4 uHoleB;
        varying vec2 vUv;
        float dep(vec2 o) { return texture2D(tDepth, vUv + o * texel).x * range; }
        bool hole(vec4 h) { vec2 d = gl_FragCoord.xy - h.xy; return h.z > 0.0 && dot(d, d) < h.z * h.z; }
        void main() {
          vec4 c = texture2D(tColor, vUv);
          float d = dep(vec2(0.0));
          // Laplaciano de la profundidad (en unidades de mundo): cero en planos inclinados, alto en siluetas y escalones.
          float l = abs(dep(vec2(1.0, 0.0)) + dep(vec2(-1.0, 0.0)) + dep(vec2(0.0, 1.0)) + dep(vec2(0.0, -1.0)) - 4.0 * d);
          float e = smoothstep(edge.x, edge.y, l);
          if (hole(uHoleA) || hole(uHoleB)) e = 0.0;
          gl_FragColor = vec4(mix(c.rgb, lineColor, e * strength), 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      depthTest: false,
      depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    quad.frustumCulled = false;
    this.quadScene.add(quad);
  }

  render(scene: THREE.Scene, camera: THREE.OrthographicCamera): void {
    const r = this.renderer;
    if (!this.enabled) {
      r.setRenderTarget(null);
      r.render(scene, camera);
      return;
    }
    const size = r.getDrawingBufferSize(new THREE.Vector2());
    if (this.target.width !== size.x || this.target.height !== size.y) this.target.setSize(size.x, size.y);
    const px = Math.max(1, Math.round(r.getPixelRatio()));
    this.mat.uniforms.texel.value.set(px / size.x, px / size.y);
    this.mat.uniforms.range.value = camera.far - camera.near;
    r.setRenderTarget(this.target);
    r.render(scene, camera);
    r.setRenderTarget(null);
    r.render(this.quadScene, this.quadCam);
  }
}
