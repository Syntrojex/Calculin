import * as THREE from "three";

/** A crisp, bold, camera-facing text label (billboard sprite) for a 3D axis. */
export function makeAxisLabelSprite(text: string, color: string): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.font = "bold 84px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // Dark outline keeps the label legible over any part of the surface/grid.
  ctx.lineWidth = 10;
  ctx.strokeStyle = "rgba(0,0,0,0.55)";
  ctx.strokeText(text, 64, 68);
  ctx.fillStyle = color;
  ctx.fillText(text, 64, 68);
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.1, 1.1, 1.1);
  return sprite;
}

/** A thin, colored 3D rod (cylinder) used as a colored axis line. */
export function makeAxisRod(length: number, radius: number, color: number, axis: "x" | "y" | "z"): THREE.Mesh {
  const geometry = new THREE.CylinderGeometry(radius, radius, length, 10);
  const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55 });
  const mesh = new THREE.Mesh(geometry, material);
  if (axis === "x") mesh.rotation.z = Math.PI / 2;
  if (axis === "z") mesh.rotation.x = Math.PI / 2;
  return mesh;
}
