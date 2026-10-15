import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { makeAxisLabelSprite } from "./graph3d-helpers";
import type { Scene as VScene } from "@/lib/vector-scene";
import type { Vec3 } from "@/lib/vector-solver";

/**
 * Same axis convention as Graph3D (z points up). The scene (arrows, dashed
 * helper copies, translucent parallelograms/faces, projection drop-lines, angle
 * arcs) comes from buildScene(), so the 3D view always matches the 2D one.
 */
function toScene(p: Vec3): THREE.Vector3 {
  return new THREE.Vector3(p.x, p.z, p.y);
}

function niceStep(range: number): number {
  const raw = range / 5;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / p;
  return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
}

export function VectorGraph3D({ scene: vs, height = 400 }: { scene: VScene; height?: number }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const range = Math.max(3, vs.extent * 1.3);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const isDark = document.documentElement.classList.contains("dark");
    const bg = isDark ? 0x12121f : 0xfafafe;
    const width = mount.clientWidth || 420;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(bg);
    scene.fog = new THREE.Fog(bg, range * 2.6, range * 5.5);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(range * 1.15, range * 0.9, range * 1.15);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.minDistance = range * 0.4;
    controls.maxDistance = range * 6;

    scene.add(new THREE.AmbientLight(0xffffff, isDark ? 0.7 : 0.85));
    const dirLight = new THREE.DirectionalLight(0xffffff, isDark ? 0.5 : 0.45);
    dirLight.position.set(range, range * 1.5, range);
    scene.add(dirLight);

    scene.add(new THREE.GridHelper(range * 2, 12, isDark ? 0x3a3a55 : 0xd0d0e0, isDark ? 0x24243a : 0xe8e8f2));

    const axisLen = range * 1.08;
    const mkAxis = (dir: [number, number, number], color: number) => {
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(...dir).multiplyScalar(axisLen)]);
      scene.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.55 })));
    };
    mkAxis([1, 0, 0], 0xff5c6e); mkAxis([0, 1, 0], 0x7c9bff); mkAxis([0, 0, 1], 0x4caf6e);
    const xLabel = makeAxisLabelSprite("x", "#ff5c6e", 0.75); xLabel.position.set(axisLen + 0.6, 0, 0);
    const zLabel = makeAxisLabelSprite("z", "#7c9bff", 0.95); zLabel.position.set(0, axisLen + 0.6, 0);
    const yLabel = makeAxisLabelSprite("y", "#4caf6e", 0.75); yLabel.position.set(0, 0, axisLen + 0.6);
    scene.add(xLabel, yLabel, zLabel);

    // numbered ticks along the three positive axes
    const step = niceStep(range * 2);
    for (let t = step; t < range * 1.02; t += step) {
      const text = String(parseFloat(t.toFixed(6)));
      const sx = makeAxisLabelSprite(text, "#94a3b8", 0.42); sx.position.set(t, -0.25, 0); scene.add(sx);
      const sy = makeAxisLabelSprite(text, "#94a3b8", 0.42); sy.position.set(0, -0.25, t); scene.add(sy);
      const sz = makeAxisLabelSprite(text, "#94a3b8", 0.42); sz.position.set(-0.3, t, 0); scene.add(sz);
    }

    const disposables: { dispose: () => void }[] = [];
    const material = (color: string, opacity = 1) => {
      const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: opacity < 1, opacity });
      disposables.push(m);
      return m;
    };
    const cylBetween = (a: THREE.Vector3, b: THREE.Vector3, radius: number, mat: THREE.Material) => {
      const dir = b.clone().sub(a);
      const len = dir.length();
      if (len < 1e-9) return;
      const geo = new THREE.CylinderGeometry(radius, radius, len, 10);
      disposables.push(geo);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(a.clone().add(b).multiplyScalar(0.5));
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
      scene.add(mesh);
    };
    const dashedPath = (a: THREE.Vector3, b: THREE.Vector3, radius: number, mat: THREE.Material) => {
      const total = b.clone().sub(a).length();
      const dash = range * 0.06, gap = range * 0.04;
      const dir = b.clone().sub(a).normalize();
      for (let s = 0; s < total; s += dash + gap) {
        cylBetween(a.clone().add(dir.clone().multiplyScalar(s)), a.clone().add(dir.clone().multiplyScalar(Math.min(s + dash, total))), radius, mat);
      }
    };

    // translucent polygons first (so arrows sit on top)
    for (const p of vs.polys) {
      const pts = p.points.map(toScene);
      if (pts.length < 3) continue;
      const positions: number[] = [];
      for (let i = 1; i < pts.length - 1; i++) positions.push(pts[0].x, pts[0].y, pts[0].z, pts[i].x, pts[i].y, pts[i].z, pts[i + 1].x, pts[i + 1].y, pts[i + 1].z);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(p.color), transparent: true, opacity: Math.min(0.5, p.opacity * 2.2), side: THREE.DoubleSide, depthWrite: false });
      disposables.push(geo, mat);
      scene.add(new THREE.Mesh(geo, mat));
    }

    // polylines
    for (const l of vs.lines) {
      const pts = l.points.map(toScene);
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = l.dashed
        ? new THREE.LineDashedMaterial({ color: new THREE.Color(l.color), dashSize: range * 0.05, gapSize: range * 0.035, transparent: true, opacity: l.faint ? 0.7 : 1 })
        : new THREE.LineBasicMaterial({ color: new THREE.Color(l.color), transparent: true, opacity: l.faint ? 0.7 : 1 });
      const line = new THREE.Line(geo, mat);
      if (l.dashed) line.computeLineDistances();
      disposables.push(geo, mat);
      scene.add(line);
    }

    // angle arcs
    for (const a of vs.arcs) {
      const pts = a.points.map(toScene);
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineBasicMaterial({ color: new THREE.Color(a.color) });
      disposables.push(geo, mat);
      scene.add(new THREE.Line(geo, mat));
      if (a.label) {
        const mid = pts[Math.floor(pts.length / 2)].clone().multiplyScalar(1.4);
        const sp = makeAxisLabelSprite(a.label, a.color, 0.62);
        sp.position.copy(mid);
        scene.add(sp);
      }
    }

    // arrows
    const headLen = Math.max(0.35, range * 0.075);
    for (const a of vs.arrows) {
      const from = toScene(a.from);
      const vec = toScene(a.vec);
      const len = vec.length();
      if (len < 1e-6) continue;
      const dir = vec.clone().normalize();
      const tip = from.clone().add(vec);
      const radius = (range * 0.0075) * ((a.width ?? 2.6) / 2.6);
      const mat = material(a.color, a.faint ? 0.5 : 1);
      const hl = Math.min(headLen, len * 0.6);
      const shaftEnd = tip.clone().sub(dir.clone().multiplyScalar(hl));
      if (a.dashed) dashedPath(from, shaftEnd, radius, mat);
      else cylBetween(from, shaftEnd, radius, mat);
      const cone = new THREE.ConeGeometry(hl * 0.36, hl, 14);
      disposables.push(cone);
      const head = new THREE.Mesh(cone, mat);
      head.position.copy(tip.clone().sub(dir.clone().multiplyScalar(hl / 2)));
      head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      scene.add(head);
      if (a.label) {
        const sp = makeAxisLabelSprite(a.label, a.color, 0.62);
        sp.position.copy(tip).add(new THREE.Vector3(0.28, 0.28, 0.28));
        scene.add(sp);
      }
    }

    let frameId = 0;
    const animate = () => {
      frameId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      const w = mount.clientWidth || 420;
      camera.aspect = w / height;
      camera.updateProjectionMatrix();
      renderer.setSize(w, height);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", handleResize);
      controls.dispose();
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
      scene.traverse((obj) => {
        if (obj instanceof THREE.Line || obj instanceof THREE.Sprite) {
          (obj as THREE.Line).geometry?.dispose?.();
          const mat = (obj as THREE.Line).material;
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
          else mat?.dispose?.();
        }
      });
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
    // the scene object is rebuilt every render — depend on its content instead
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(vs), height]);

  return <div ref={mountRef} className="w-full rounded-xl overflow-hidden border border-border" style={{ height }} />;
}
