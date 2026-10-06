import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { makeAxisLabelSprite } from "./graph3d-helpers";

interface Vector3Arrow {
  x: number;
  y: number;
  z: number;
  color: string;
  label: string;
  /** Tail point, default the origin — set this for tip-to-tail display. */
  from?: { x: number; y: number; z: number };
}

/**
 * Same axis convention as Graph3D (so the two 3D views in the app feel
 * consistent): the vertical screen axis is labeled "z" and the horizontal
 * depth axis is labeled "y", matching the standard right-handed math
 * convention where z points up.
 */
function toScene(x: number, y: number, z: number): [number, number, number] {
  return [x, z, y];
}

export function VectorGraph3D({ vectors, range = 6 }: { vectors: Vector3Arrow[]; range?: number }) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const isDark = document.documentElement.classList.contains("dark");
    const bg = isDark ? 0x12121f : 0xfafafe;

    const width = mount.clientWidth || 400;
    const height = 380;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(bg);
    scene.fog = new THREE.Fog(bg, range * 2.2, range * 4.5);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(range * 1.1, range * 0.85, range * 1.1);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.minDistance = range * 0.4;
    controls.maxDistance = range * 6;

    scene.add(new THREE.AmbientLight(0xffffff, isDark ? 0.55 : 0.75));
    const dirLight = new THREE.DirectionalLight(0xffffff, isDark ? 0.6 : 0.5);
    dirLight.position.set(range, range * 1.5, range);
    scene.add(dirLight);

    // Ground grid, drawn at z=0 (the x-y plane).
    const grid = new THREE.GridHelper(range * 2, 12, isDark ? 0x3a3a55 : 0xd0d0e0, isDark ? 0x24243a : 0xe8e8f2);
    scene.add(grid);

    // Axis rods + labels, same look as Graph3D.
    const axisLen = range * 1.08;
    const mkAxis = (dir: [number, number, number], color: number) => {
      const points = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(...dir).multiplyScalar(axisLen)];
      const geo = new THREE.BufferGeometry().setFromPoints(points);
      scene.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.55 })));
    };
    mkAxis([1, 0, 0], 0xff5c6e);
    mkAxis([0, 1, 0], 0x7c9bff);
    mkAxis([0, 0, 1], 0x4caf6e);

    const xLabel = makeAxisLabelSprite("x", "#ff5c6e", 0.75);
    xLabel.position.set(axisLen + 0.6, 0, 0);
    const zLabel = makeAxisLabelSprite("z", "#7c9bff", 0.95);
    zLabel.position.set(0, axisLen + 0.6, 0);
    const yLabel = makeAxisLabelSprite("y", "#4caf6e", 0.75);
    yLabel.position.set(0, 0, axisLen + 0.6);
    scene.add(xLabel, yLabel, zLabel);

    // One arrow per vector, plus a small sprite label near the tip.
    const headLength = Math.max(0.35, range * 0.09);
    const headWidth = headLength * 0.55;
    for (const v of vectors) {
      if (!isFinite(v.x) || !isFinite(v.y) || !isFinite(v.z)) continue;
      const [fx, fy, fz] = v.from ? toScene(v.from.x, v.from.y, v.from.z) : [0, 0, 0];
      const [dx, dy, dz] = toScene(v.x, v.y, v.z);
      const dir = new THREE.Vector3(dx, dy, dz);
      const len = dir.length();
      if (len < 1e-6) continue;
      const origin = new THREE.Vector3(fx, fy, fz);
      const color = new THREE.Color(v.color);
      const arrow = new THREE.ArrowHelper(dir.clone().normalize(), origin, len, color, headLength, headWidth);
      (arrow.line.material as THREE.LineBasicMaterial).linewidth = 2;
      scene.add(arrow);

      const tip = origin.clone().add(dir);
      const label = makeAxisLabelSprite(v.label, v.color, 0.6);
      label.position.copy(tip).add(new THREE.Vector3(0.25, 0.25, 0.25));
      scene.add(label);
    }

    let frameId: number;
    const animate = () => {
      frameId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      const w = mount.clientWidth || 400;
      camera.aspect = w / height;
      camera.updateProjectionMatrix();
      renderer.setSize(w, height);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", handleResize);
      controls.dispose();
      renderer.dispose();
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Line) {
          obj.geometry?.dispose();
          const mat = obj.material;
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
          else mat?.dispose();
        }
      });
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
    // vectors is a fresh array each render (built inline by the caller), so
    // depend on its serialized content rather than identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(vectors), range]);

  return <div ref={mountRef} className="w-full rounded-xl overflow-hidden border border-border" />;
}
