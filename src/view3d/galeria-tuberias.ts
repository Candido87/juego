/**
 * Galería de tuberías (página de desarrollo `galeria-tuberias.html`): cada pieza `pipe-large-*` del Factory Kit tal como viene en el archivo
 * (fila de arriba, material normal; fila de abajo, versión de cristal), con sus ejes (x rojo, y verde, z azul), el contorno de la casilla de 1×1
 * y sus puertos geométricos (flecha amarilla hacia fuera en el centro de cada brida, de `tuberiasPiezas.ts`). Sirve para comprobar de un vistazo qué hace
 * cada pieza y dónde están sus extremos.
 *
 * Automatización: `window.__tub.view('iso'|'arriba'|'frente'|'lado')`, `window.__tub.focus(i)`, `window.__tub.render()`.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { gltf, preload } from './loader';
import { PIPE_PIECES, glassModel } from './tuberiasPiezas';

const GAP = 3.4;

export async function startPipeGallery(host: HTMLElement): Promise<void> {
  const ids = PIPE_PIECES.flatMap((p) => [p.model, glassModel(p.model)]);
  await preload(ids);
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xdfe6ea);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x7a8a9a, 1.9));
  const sun = new THREE.DirectionalLight(0xfff2d8, 2.2);
  sun.position.set(8, 20, 12);
  scene.add(sun);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 40).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xb8d89a, roughness: 1 }));
  ground.position.set(15, -0.01, 3);
  scene.add(ground);

  const label = (text: string, sub: string, x: number, z: number) => {
    const c = document.createElement('canvas');
    c.width = 384;
    c.height = 96;
    const g = c.getContext('2d')!;
    g.fillStyle = 'rgba(255,255,255,0.92)';
    g.fillRect(0, 0, 384, 96);
    g.fillStyle = '#1d2330';
    g.font = 'bold 32px system-ui, sans-serif';
    g.textAlign = 'center';
    g.fillText(text, 192, 40, 372);
    g.font = '22px system-ui, sans-serif';
    g.fillText(sub, 192, 78, 372);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }));
    sp.scale.set(2.4, 0.6, 1);
    sp.position.set(x, 0.02, z + 1.9);
    sp.renderOrder = 10;
    scene.add(sp);
  };

  const centers: THREE.Vector3[] = [];
  PIPE_PIECES.forEach((p, i) => {
    for (const row of [0, 1]) {
      const x = 2 + i * GAP;
      const z = row * 5;
      const obj = gltf(row === 0 ? p.model : glassModel(p.model)).scene.clone(true);
      obj.position.set(x, 0, z);
      scene.add(obj);
      // Ejes del archivo y casilla de 1×1 (en la base) para ver cómo cae la pieza sobre la rejilla.
      const axes = new THREE.AxesHelper(1.3);
      axes.position.set(x, 0.001, z);
      scene.add(axes);
      const tile = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.5, 0, -0.5), new THREE.Vector3(0.5, 0, -0.5), new THREE.Vector3(0.5, 0, 0.5), new THREE.Vector3(-0.5, 0, 0.5)]),
        new THREE.LineBasicMaterial({ color: 0x3a4a2a }),
      );
      tile.position.set(x, 0.01, z);
      scene.add(tile);
      // Puertos geométricos: esfera en el centro de la cara exterior de la brida y flecha amarilla hacia fuera.
      for (const port of p.ports) {
        const origin = new THREE.Vector3(x + port.pos[0], port.pos[1], z + port.pos[2]);
        const arrow = new THREE.ArrowHelper(new THREE.Vector3(...port.dir), origin, 0.5, 0xffc400, 0.16, 0.1);
        (arrow.line.material as THREE.LineBasicMaterial).depthTest = false;
        (arrow.cone.material as THREE.MeshBasicMaterial).depthTest = false;
        arrow.renderOrder = 8;
        scene.add(arrow);
        const dot = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff2d55, depthTest: false }));
        dot.position.copy(origin);
        dot.renderOrder = 9;
        scene.add(dot);
      }
      if (row === 0) label(p.id, `${p.ports.length} puertos`, x, z);
      if (row === 0) centers.push(new THREE.Vector3(x, 0.5, z));
    }
  });

  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 200);
  const controls = new OrbitControls(camera, renderer.domElement);
  const mid = new THREE.Vector3(2 + ((PIPE_PIECES.length - 1) * GAP) / 2, 0.5, 2.5);
  const place = (mode: string, target = mid, span = (PIPE_PIECES.length * GAP) / 2 + 3) => {
    controls.target.copy(target);
    const d = span * 1.55;
    const views: Record<string, [number, number, number]> = { iso: [d * 0.55, d * 0.7, d * 0.75], arriba: [0.001, d * 1.1, 0.001], frente: [0, 1.2, d * 1.2], lado: [d * 1.2, 1.2, 0.001] };
    const v = views[mode] ?? views.iso;
    camera.position.set(target.x + v[0], target.y + v[1], target.z + v[2]);
    controls.update();
  };
  place('iso');
  const resize = () => {
    const w = host.clientWidth || innerWidth;
    const h = host.clientHeight || innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  addEventListener('resize', resize);
  resize();
  const render = () => renderer.render(scene, camera);
  (function loop() {
    controls.update();
    render();
    requestAnimationFrame(loop);
  })();
  (window as unknown as { __tub: unknown }).__tub = {
    view: (m: string) => (place(m), render()),
    focus: (i: number) => {
      place('iso', centers[i].clone().add(new THREE.Vector3(0, 0, 2.5)), 3.2);
      render();
    },
    render,
    pieces: PIPE_PIECES.map((p) => p.id),
  };
}
