import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { parse } from "mathjs";

interface Graph3DProps {
  expression: string;
  range?: number;
  resolution?: number;
}

/** Vivid multi-stop colormap (deep indigo → cyan → emerald → gold → orange → crimson), t in [0,1]. */
function colormap(t: number): [number, number, number] {
  const stops: [number, [number, number, number]][] = [
    [0.0, [0.16, 0.07, 0.55]],
    [0.2, [0.1, 0.45, 0.85]],
    [0.4, [0.05, 0.75, 0.7]],
    [0.6, [0.35, 0.85, 0.25]],
    [0.78, [0.97, 0.78, 0.1]],
    [0.9, [0.95, 0.45, 0.08]],
    [1.0, [0.85, 0.1, 0.2]],
  ];
  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, c0] = stops[i];
    const [t1, c1] = stops[i + 1];
    if (t >= t0 && t <= t1) {
      const f = (t - t0) / (t1 - t0 || 1);
      return [c0[0] + (c1[0] - c0[0]) * f, c0[1] + (c1[1] - c0[1]) * f, c0[2] + (c1[2] - c0[2]) * f];
    }
  }
  return stops[stops.length - 1][1];
}

function makeAxisLabelSprite(text: string, color: string): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  ctx.font = "bold 40px system-ui, sans-serif";
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 32, 34);
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1, 1, 1);
  return sprite;
}

export function Graph3D({ expression, range = 5, resolution = 80 }: Graph3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    setError(null);

    let compiled: { evaluate: (scope: Record<string, number>) => unknown };
    try {
      compiled = parse(expression).compile();
    } catch (e: unknown) {
      setError(e instanceof Error ? `Parse error: ${e.message}` : "Invalid expression");
      return;
    }

    const height = 480;
    let width = container.clientWidth || 600;

    const isDark = document.documentElement.classList.contains("dark");

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(isDark ? 0x0d0d16 : 0xf5f5fa, range * 3.5, range * 9);

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 1000);
    camera.position.set(range * 1.6, range * 1.25, range * 1.6);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
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
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.0);
    keyLight.position.set(range * 1.2, range * 2.2, range * 0.8);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0x88aaff, 0.35);
    fillLight.position.set(-range, range * 0.6, -range);
    scene.add(fillLight);
    const rimLight = new THREE.DirectionalLight(0xffe0c0, 0.25);
    rimLight.position.set(0, -range, range * 1.5);
    scene.add(rimLight);

    const grid = new THREE.GridHelper(range * 2, 14, isDark ? 0x6a6a88 : 0x999999, isDark ? 0x3a3a52 : 0xcccccc);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.45;
    scene.add(grid);

    // Subtle colored axis indicators
    const axisLen = range * 1.08;
    const xAxis = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-axisLen, 0, 0), new THREE.Vector3(axisLen, 0, 0)]),
      new THREE.LineBasicMaterial({ color: 0xff5c6e, transparent: true, opacity: 0.55 })
    );
    const zAxis = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, -axisLen), new THREE.Vector3(0, 0, axisLen)]),
      new THREE.LineBasicMaterial({ color: 0x4caf6e, transparent: true, opacity: 0.55 })
    );
    scene.add(xAxis, zAxis);

    const xLabel = makeAxisLabelSprite("x", "#ff5c6e");
    xLabel.position.set(axisLen + 0.4, 0, 0);
    const yLabel = makeAxisLabelSprite("z", "#7c9bff");
    yLabel.position.set(0, range * 0.65, 0);
    const zLabel = makeAxisLabelSprite("y", "#4caf6e");
    zLabel.position.set(0, 0, axisLen + 0.4);
    scene.add(xLabel, yLabel, zLabel);

    const segs = resolution;
    const heights: number[][] = [];
    let zMin = Infinity, zMax = -Infinity;

    for (let i = 0; i <= segs; i++) {
      const xv = -range + (2 * range * i) / segs;
      const row: number[] = [];
      for (let j = 0; j <= segs; j++) {
        const yv = -range + (2 * range * j) / segs;
        let zv: number;
        try {
          const v = compiled.evaluate({ x: xv, y: yv });
          zv = typeof v === "number" && isFinite(v) ? v : NaN;
        } catch {
          zv = NaN;
        }
        row.push(zv);
        if (!Number.isNaN(zv)) {
          zMin = Math.min(zMin, zv);
          zMax = Math.max(zMax, zv);
        }
      }
      heights.push(row);
    }

    if (!isFinite(zMin) || !isFinite(zMax)) {
      setError("Couldn't evaluate this function over the grid — make sure it uses x and y, e.g. sin(x) * cos(y)");
      renderer.dispose();
      return;
    }

    // Clip extreme outliers (common near asymptotes) using percentile-based bounds
    // so a single near-infinite spike doesn't flatten the rest of the surface.
    const finiteVals: number[] = [];
    for (const row of heights) for (const v of row) if (!Number.isNaN(v)) finiteVals.push(v);
    finiteVals.sort((a, b) => a - b);
    const p = (q: number) => finiteVals[Math.min(finiteVals.length - 1, Math.max(0, Math.floor(q * finiteVals.length)))];
    const clipMin = p(0.02);
    const clipMax = p(0.98);
    const useClip = clipMax > clipMin && (zMax - zMin) > (clipMax - clipMin) * 3;
    const effMin = useClip ? clipMin : zMin;
    const effMax = useClip ? clipMax : zMax;

    const zRange = effMax - effMin || 1;
    const scaleFactor = (range / Math.max(zRange, 1e-6)) * 0.62;
    const zMid = (effMin + effMax) / 2;

    const positions: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];
    const valid: boolean[][] = [];

    for (let i = 0; i <= segs; i++) {
      const xv = -range + (2 * range * i) / segs;
      const validRow: boolean[] = [];
      for (let j = 0; j <= segs; j++) {
        const yv = -range + (2 * range * j) / segs;
        const rawZv = heights[i][j];
        const isValid = !Number.isNaN(rawZv) && rawZv >= effMin - zRange * 0.5 && rawZv <= effMax + zRange * 0.5;
        validRow.push(isValid);
        const zv = isValid ? rawZv : zMid;
        const clamped = Math.max(effMin - zRange * 0.1, Math.min(effMax + zRange * 0.1, zv));
        const scaledHeight = (clamped - zMid) * scaleFactor;
        positions.push(xv, scaledHeight, yv);
        const t = Math.max(0, Math.min(1, (clamped - effMin) / zRange));
        const [r, g, b] = colormap(t);
        colors.push(r, g, b);
      }
      valid.push(validRow);
    }

    // Only emit triangles where all three corners are valid — this leaves a
    // genuine hole at asymptotes/singularities instead of a flat smeared patch.
    for (let i = 0; i < segs; i++) {
      for (let j = 0; j < segs; j++) {
        const a = i * (segs + 1) + j;
        const b = a + 1;
        const c = a + (segs + 1);
        const d = c + 1;
        const vA = valid[i][j], vB = valid[i][j + 1], vC = valid[i + 1][j], vD = valid[i + 1][j + 1];
        if (vA && vC && vB) indices.push(a, c, b);
        if (vB && vC && vD) indices.push(b, c, d);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setIndex(indices);
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();

    const material = new THREE.MeshPhysicalMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      roughness: 0.32,
      metalness: 0.08,
      clearcoat: 0.25,
      clearcoatRoughness: 0.4,
      reflectivity: 0.25,
    });
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    const wireGeo = new THREE.WireframeGeometry(geometry);
    const wireMat = new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.05 });
    const wireframe = new THREE.LineSegments(wireGeo, wireMat);
    scene.add(wireframe);

    let raf = 0;
    const animate = () => {
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    };
    animate();

    const onResize = () => {
      if (!container) return;
      width = container.clientWidth || width;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    window.addEventListener("resize", onResize);
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(container);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      resizeObserver.disconnect();
      controls.dispose();
      renderer.dispose();
      geometry.dispose();
      wireGeo.dispose();
      material.dispose();
      wireMat.dispose();
      grid.geometry.dispose();
      (grid.material as THREE.Material).dispose();
      (xAxis.geometry as THREE.BufferGeometry).dispose();
      (zAxis.geometry as THREE.BufferGeometry).dispose();
      (xAxis.material as THREE.Material).dispose();
      (zAxis.material as THREE.Material).dispose();
      [xLabel, yLabel, zLabel].forEach((s) => {
        (s.material as THREE.SpriteMaterial).map?.dispose();
        (s.material as THREE.SpriteMaterial).dispose();
      });
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [expression, range, resolution]);

  return (
    <div className="space-y-2">
      <div
        ref={containerRef}
        className="w-full rounded-xl border border-border overflow-hidden bg-gradient-to-b from-muted/30 to-muted/10"
        style={{ height: 480, touchAction: "none" }}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!error && (
        <p className="text-xs text-muted-foreground">
          <span className="text-[#ff5c6e] font-semibold">x</span> ·{" "}
          <span className="text-[#4caf6e] font-semibold">y</span> ·{" "}
          <span className="text-[#7c9bff] font-semibold">z = f(x,y)</span> · drag to rotate · scroll to zoom
        </p>
      )}
    </div>
  );
}
