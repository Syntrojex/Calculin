import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { makeAxisLabelSprite, makeAxisRod } from "./graph3d-helpers";
import { fitScale, colormap, meshFromSurface, type ShapeData } from "@/lib/param3d";

interface Props {
  data: ShapeData;
  range?: number;
  fillParent?: boolean;
  label?: string;
}

const fmt = (n: number) => (Math.abs(n) >= 100 ? n.toFixed(0) : Math.abs(n) >= 10 ? n.toFixed(1) : n.toFixed(2)).replace(/\.?0+$/, "");

export function ParametricGraph3D({ data, range = 5, fillParent = false, label }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [info, setInfo] = useState("");

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let height = container.clientHeight || 480;
    let width = container.clientWidth || 600;
    const isDark = document.documentElement.classList.contains("dark");

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(isDark ? 0x0d0d16 : 0xf5f5fa, range * 3.5, range * 9);
    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 1000);
    camera.position.set(range * 1.6, range * 1.25, range * 1.6);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.minDistance = range * 0.45;
    controls.maxDistance = range * 7;
    controls.maxPolarAngle = Math.PI * 0.97;

    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 1.0); key.position.set(range * 1.2, range * 2.2, range * 0.8); scene.add(key);
    const fillL = new THREE.DirectionalLight(0x88aaff, 0.35); fillL.position.set(-range, range * 0.6, -range); scene.add(fillL);
    const rim = new THREE.DirectionalLight(0xffe0c0, 0.25); rim.position.set(0, -range, range * 1.5); scene.add(rim);

    const grid = new THREE.GridHelper(range * 2, 14, isDark ? 0x6a6a88 : 0x999999, isDark ? 0x3a3a52 : 0xcccccc);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.45;
    scene.add(grid);

    const axisLen = range * 1.08;
    const rodR = Math.max(range * 0.002, 0.008);
    const xAxis = makeAxisRod(axisLen * 2, rodR, 0xff5c6e, "x");
    const yAxis = makeAxisRod(axisLen * 2, rodR, 0x7c9bff, "y");
    const zAxis = makeAxisRod(axisLen * 2, rodR, 0x4caf6e, "z");
    scene.add(xAxis, yAxis, zAxis);
    const xl = makeAxisLabelSprite("x", "#ff5c6e", 0.75); xl.position.set(axisLen + 0.6, 0, 0);
    const zl = makeAxisLabelSprite("z", "#7c9bff", 0.95); zl.position.set(0, axisLen + 0.6, 0);
    const yl = makeAxisLabelSprite("y", "#4caf6e", 0.75); yl.position.set(0, 0, axisLen + 0.6);
    scene.add(xl, zl, yl);

    const { scale: s, extent } = fitScale(data, range);
    setInfo(`axes reach about ±${fmt(range / s)} units`);
    // math (x, y, z) → three (x, z, y): z is "up", like the other 3D graphs
    const toV = (p: [number, number, number]) => new THREE.Vector3(p[0] * s, p[2] * s, p[1] * s);

    const disposables: { dispose: () => void }[] = [];
    if (data.kind === "curve") {
      const total = data.segments.reduce((n, g) => n + g.length, 0);
      let done = 0;
      data.segments.forEach((seg) => {
        const pts = seg.map(toV);
        const path = new THREE.CatmullRomCurve3(pts, false, "centripetal");
        const tubular = Math.min(2400, Math.max(8, pts.length * 2));
        const geo = new THREE.TubeGeometry(path, tubular, Math.max(range * 0.013, 0.02), 8, false);
        const count = geo.attributes.position.count;
        const colors = new Float32Array(count * 3);
        const ring = 9;
        for (let i = 0; i < count; i++) {
          const ti = Math.floor(i / ring) / tubular;
          const [r, g, b] = colormap((done + ti * seg.length) / Math.max(total, 1));
          colors[i * 3] = r; colors[i * 3 + 1] = g; colors[i * 3 + 2] = b;
        }
        geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
        done += seg.length;
        const mat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.1, clearcoat: 0.3 });
        scene.add(new THREE.Mesh(geo, mat));
        disposables.push(geo, mat);
      });
    } else {
      const mesh = meshFromSurface(data, s, range);
      const positions = mesh.positions, colors = mesh.colors, idx = mesh.indices;
      const geo = new THREE.BufferGeometry();
      geo.setIndex(idx);
      geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
      geo.computeVertexNormals();
      const mat = new THREE.MeshPhysicalMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.32, metalness: 0.08, clearcoat: 0.25, clearcoatRoughness: 0.4 });
      scene.add(new THREE.Mesh(geo, mat));
      const wireGeo = new THREE.WireframeGeometry(geo);
      const wireMat = new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.05 });
      scene.add(new THREE.LineSegments(wireGeo, wireMat));
      disposables.push(geo, mat, wireGeo, wireMat);
    }
    void extent;

    let raf = 0;
    const animate = () => { controls.update(); renderer.render(scene, camera); raf = requestAnimationFrame(animate); };
    animate();

    const onResize = () => {
      width = container.clientWidth || width;
      height = container.clientHeight || height;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    window.addEventListener("resize", onResize);
    const ro = new ResizeObserver(onResize);
    ro.observe(container);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      disposables.forEach((d) => d.dispose());
      grid.geometry.dispose();
      (grid.material as THREE.Material).dispose();
      [xAxis, yAxis, zAxis].forEach((a) => { (a.geometry as THREE.BufferGeometry).dispose(); (a.material as THREE.Material).dispose(); });
      [xl, yl, zl].forEach((sp) => { (sp.material as THREE.SpriteMaterial).map?.dispose(); (sp.material as THREE.SpriteMaterial).dispose(); });
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
    };
  }, [data, range, fillParent]);

  return (
    <div className={fillParent ? "space-y-2 h-full flex flex-col" : "space-y-2"}>
      <div
        ref={containerRef}
        className={fillParent ? "w-full flex-1 min-h-0 rounded-xl border border-border overflow-hidden bg-gradient-to-b from-muted/30 to-muted/10" : "w-full rounded-xl border border-border overflow-hidden bg-gradient-to-b from-muted/30 to-muted/10"}
        style={fillParent ? { touchAction: "none" } : { height: 480, touchAction: "none" }}
        aria-label={label ?? "3D shape"}
      />
      <p className="text-xs text-muted-foreground">
        <span className="text-[#ff5c6e] font-semibold">x</span> · <span className="text-[#4caf6e] font-semibold">y</span> · <span className="text-[#7c9bff] font-semibold">z</span> (up) · true proportions · {info} · <span className="sm:hidden">one-finger drag to rotate · pinch to zoom</span><span className="hidden sm:inline">drag to rotate · scroll to zoom</span>
      </p>
    </div>
  );
}
