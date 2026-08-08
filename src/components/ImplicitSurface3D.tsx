import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { parse } from "mathjs";

interface ImplicitSurface3DProps {
  /** F(x,y,z) expression already rearranged so the equation is F = 0, e.g. "x^2+y^2+z^2-25" for a sphere of radius 5. */
  expression: string;
  varNames?: [string, string, string];
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

/**
 * Naive Surface Nets — builds a smooth, continuous, lit triangle mesh from an
 * implicit scalar field F(x,y,z)=0 (replacing a far less smooth "point cloud
 * at cell centers" approach). One vertex is placed per active cell at the
 * average of its sign-crossing edge intersections, and the mesh is then
 * stitched together by connecting cells that share a sign-changing edge.
 * Per-vertex normals come from the analytic gradient of F for correct,
 * winding-independent shading.
 */
export function ImplicitSurface3D({
  expression,
  varNames = ["x", "y", "z"],
  range = 6,
  resolution = 36,
}: ImplicitSurface3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [vertexCount, setVertexCount] = useState(0);

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

    const evalF = (x: number, y: number, z: number): number => {
      try {
        const r = compiled.evaluate({ [varNames[0]]: x, [varNames[1]]: y, [varNames[2]]: z });
        return typeof r === "number" && isFinite(r) ? r : NaN;
      } catch {
        return NaN;
      }
    };

    const height = 480;
    let width = container.clientWidth || 600;
    const isDark = document.documentElement.classList.contains("dark");

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(isDark ? 0x0d0d16 : 0xf5f5fa, range * 3.5, range * 9);

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 1000);
    camera.position.set(range * 1.7, range * 1.35, range * 1.7);
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
    controls.minDistance = range * 0.35;
    controls.maxDistance = range * 8;

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
    (grid.material as THREE.Material).opacity = 0.35;
    scene.add(grid);

    const segs = resolution;
    const N = segs + 1;
    const step = (2 * range) / segs;
    const gridX = (i: number) => -range + i * step;

    const values = new Float32Array(N * N * N);
    const vIdx = (i: number, j: number, k: number) => (i * N + j) * N + k;
    for (let i = 0; i < N; i++) {
      const x = gridX(i);
      for (let j = 0; j < N; j++) {
        const y = gridX(j);
        for (let k = 0; k < N; k++) {
          values[vIdx(i, j, k)] = evalF(x, y, gridX(k));
        }
      }
    }

    // The 8 corner offsets of a cell, and the 12 edges connecting them (by corner index pairs).
    const CORNER_OFFSETS: [number, number, number][] = [
      [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
      [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1],
    ];
    const EDGES: [number, number][] = [
      [0, 1], [1, 2], [2, 3], [3, 0],
      [4, 5], [5, 6], [6, 7], [7, 4],
      [0, 4], [1, 5], [2, 6], [3, 7],
    ];

    const cellVertexIndex = new Int32Array(segs * segs * segs).fill(-1);
    const cIdx = (i: number, j: number, k: number) => (i * segs + j) * segs + k;

    const positions: number[] = [];
    const normals: number[] = [];
    const colors: number[] = [];

    let valMin = Infinity, valMax = -Infinity;

    for (let i = 0; i < segs; i++) {
      for (let j = 0; j < segs; j++) {
        for (let k = 0; k < segs; k++) {
          const cornerVals: number[] = [];
          let anyNaN = false;
          for (const [oi, oj, ok] of CORNER_OFFSETS) {
            const v = values[vIdx(i + oi, j + oj, k + ok)];
            if (Number.isNaN(v)) anyNaN = true;
            cornerVals.push(v);
          }
          if (anyNaN) continue;

          const hasPos = cornerVals.some((v) => v >= 0);
          const hasNeg = cornerVals.some((v) => v < 0);
          if (!hasPos || !hasNeg) continue;

          // Average the edge-crossing points for a smooth, accurate vertex position.
          let sx = 0, sy = 0, sz = 0, count = 0;
          for (const [e0, e1] of EDGES) {
            const v0 = cornerVals[e0], v1 = cornerVals[e1];
            if ((v0 >= 0) === (v1 >= 0)) continue;
            const t = v0 / (v0 - v1);
            const [o0x, o0y, o0z] = CORNER_OFFSETS[e0];
            const [o1x, o1y, o1z] = CORNER_OFFSETS[e1];
            sx += (o0x + (o1x - o0x) * t);
            sy += (o0y + (o1y - o0y) * t);
            sz += (o0z + (o1z - o0z) * t);
            count++;
          }
          if (count === 0) continue;

          const cellX = gridX(i) + (sx / count) * step;
          const cellY = gridX(j) + (sy / count) * step;
          const cellZ = gridX(k) + (sz / count) * step;

          // Analytic-ish gradient via central differences for correct, smooth shading.
          const h = step * 0.5;
          const gx = (evalF(cellX + h, cellY, cellZ) - evalF(cellX - h, cellY, cellZ)) / (2 * h);
          const gy = (evalF(cellX, cellY + h, cellZ) - evalF(cellX, cellY - h, cellZ)) / (2 * h);
          const gz = (evalF(cellX, cellY, cellZ + h) - evalF(cellX, cellY, cellZ - h)) / (2 * h);
          let glen = Math.sqrt(gx * gx + gy * gy + gz * gz);
          if (!isFinite(glen) || glen < 1e-8) glen = 1;

          cellVertexIndex[cIdx(i, j, k)] = positions.length / 3;
          positions.push(cellX, cellY, cellZ);
          normals.push(gx / glen, gy / glen, gz / glen);

          valMin = Math.min(valMin, cellY);
          valMax = Math.max(valMax, cellY);
        }
      }
    }

    const vCount = positions.length / 3;
    setVertexCount(vCount);

    if (vCount === 0) {
      setError("No surface found in this range — try a different equation or wider range (e.g. x^2+y^2+z^2-25 for a sphere).");
      renderer.dispose();
      return;
    }

    const yRange = valMax - valMin || 1;
    for (let p = 0; p < vCount; p++) {
      const t = Math.max(0, Math.min(1, (positions[p * 3 + 1] - valMin) / yRange));
      const [r, g, b] = colormap(t);
      colors.push(r, g, b);
    }

    // Stitch quads across every sign-changing grid edge, connecting the (up to)
    // 4 surrounding active cells. DoubleSide rendering + analytic per-vertex
    // normals make this robust even if a quad's winding ends up reversed.
    const indices: number[] = [];
    const addQuad = (a: number, b: number, c: number, d: number) => {
      if (a < 0 || b < 0 || c < 0 || d < 0) return;
      indices.push(a, b, c, a, c, d);
    };

    // X-direction edges: (i,j,k) -> (i+1,j,k)
    for (let i = 0; i < segs; i++) {
      for (let j = 1; j < segs; j++) {
        for (let k = 1; k < segs; k++) {
          const v0 = values[vIdx(i, j, k)], v1 = values[vIdx(i + 1, j, k)];
          if (Number.isNaN(v0) || Number.isNaN(v1) || (v0 >= 0) === (v1 >= 0)) continue;
          const c00 = cellVertexIndex[cIdx(i, j - 1, k - 1)];
          const c10 = cellVertexIndex[cIdx(i, j, k - 1)];
          const c11 = cellVertexIndex[cIdx(i, j, k)];
          const c01 = cellVertexIndex[cIdx(i, j - 1, k)];
          addQuad(c00, c10, c11, c01);
        }
      }
    }
    // Y-direction edges: (i,j,k) -> (i,j+1,k)
    for (let i = 1; i < segs; i++) {
      for (let j = 0; j < segs; j++) {
        for (let k = 1; k < segs; k++) {
          const v0 = values[vIdx(i, j, k)], v1 = values[vIdx(i, j + 1, k)];
          if (Number.isNaN(v0) || Number.isNaN(v1) || (v0 >= 0) === (v1 >= 0)) continue;
          const c00 = cellVertexIndex[cIdx(i - 1, j, k - 1)];
          const c10 = cellVertexIndex[cIdx(i, j, k - 1)];
          const c11 = cellVertexIndex[cIdx(i, j, k)];
          const c01 = cellVertexIndex[cIdx(i - 1, j, k)];
          addQuad(c00, c10, c11, c01);
        }
      }
    }
    // Z-direction edges: (i,j,k) -> (i,j,k+1)
    for (let i = 1; i < segs; i++) {
      for (let j = 1; j < segs; j++) {
        for (let k = 0; k < segs; k++) {
          const v0 = values[vIdx(i, j, k)], v1 = values[vIdx(i, j, k + 1)];
          if (Number.isNaN(v0) || Number.isNaN(v1) || (v0 >= 0) === (v1 >= 0)) continue;
          const c00 = cellVertexIndex[cIdx(i - 1, j - 1, k)];
          const c10 = cellVertexIndex[cIdx(i, j - 1, k)];
          const c11 = cellVertexIndex[cIdx(i, j, k)];
          const c01 = cellVertexIndex[cIdx(i - 1, j, k)];
          addQuad(c00, c10, c11, c01);
        }
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setIndex(indices);
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));

    const material = new THREE.MeshPhysicalMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      roughness: 0.3,
      metalness: 0.08,
      clearcoat: 0.3,
      clearcoatRoughness: 0.35,
      reflectivity: 0.25,
    });
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

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
      material.dispose();
      grid.geometry.dispose();
      (grid.material as THREE.Material).dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [expression, varNames, range, resolution]);

  return (
    <div className="space-y-2">
      <div
        ref={containerRef}
        className="w-full rounded-xl border border-border overflow-hidden bg-gradient-to-b from-muted/30 to-muted/10"
        style={{ height: 480, touchAction: "none" }}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!error && <p className="text-xs text-muted-foreground">{vertexCount.toLocaleString()} surface vertices · drag to rotate · scroll to zoom</p>}
    </div>
  );
}
