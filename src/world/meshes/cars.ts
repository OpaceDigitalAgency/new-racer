import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import type { Scene } from "@babylonjs/core/scene";

export type CarStyle = "basic" | "premium";

export function createCarMesh(scene: Scene, style: CarStyle): TransformNode {
  const root = new TransformNode(`carRoot:${style}`, scene);
  root.rotationQuaternion = null;

  const paint = new PBRMaterial(`carPaint:${style}`, scene);
  paint.metallic = 0.85;
  paint.roughness = style === "premium" ? 0.22 : 0.35;
  paint.albedoColor = style === "premium" ? new Color3(0.09, 0.11, 0.13) : new Color3(0.11, 0.13, 0.16);
  paint.clearCoat.isEnabled = style === "premium";
  paint.clearCoat.intensity = style === "premium" ? 1.0 : 0;
  paint.clearCoat.roughness = 0.08;

  const emissive = new PBRMaterial(`carGlow:${style}`, scene);
  emissive.metallic = 0.0;
  emissive.roughness = 1.0;
  emissive.albedoColor = new Color3(0, 0, 0);
  emissive.emissiveColor = style === "premium" ? new Color3(1.0, 0.42, 0.0) : new Color3(0.0, 0.7, 1.0);

  const body = MeshBuilder.CreateBox(
    `carBody:${style}`,
    { width: 1.6, height: 0.55, depth: 3.2, faceColors: undefined },
    scene
  );
  body.material = paint;
  body.parent = root;
  body.position = new Vector3(0, 0.55, 0);

  const cabin = MeshBuilder.CreateBox(`carCabin:${style}`, { width: 1.2, height: 0.45, depth: 1.2 }, scene);
  cabin.material = paint;
  cabin.parent = root;
  cabin.position = new Vector3(0, 0.9, -0.35);

  const bumper = MeshBuilder.CreateBox(`carBumper:${style}`, { width: 1.65, height: 0.28, depth: 0.45 }, scene);
  bumper.material = paint;
  bumper.parent = root;
  bumper.position = new Vector3(0, 0.48, 1.55);

  const rear = MeshBuilder.CreateBox(`carRear:${style}`, { width: 1.65, height: 0.3, depth: 0.5 }, scene);
  rear.material = paint;
  rear.parent = root;
  rear.position = new Vector3(0, 0.48, -1.55);

  const wheelMat = new PBRMaterial(`wheel:${style}`, scene);
  wheelMat.albedoColor = new Color3(0.02, 0.02, 0.02);
  wheelMat.metallic = 0.15;
  wheelMat.roughness = 0.9;

  const rimMat = new PBRMaterial(`rim:${style}`, scene);
  rimMat.albedoColor = new Color3(0.18, 0.18, 0.18);
  rimMat.metallic = 0.8;
  rimMat.roughness = 0.25;
  rimMat.emissiveColor = style === "premium" ? new Color3(1.0, 0.35, 0.0) : new Color3(0, 0, 0);

  const wheelPositions: Array<{ x: number; z: number }> = [
    { x: -0.75, z: 1.05 },
    { x: 0.75, z: 1.05 },
    { x: -0.75, z: -1.05 },
    { x: 0.75, z: -1.05 }
  ];

  for (const [idx, p] of wheelPositions.entries()) {
    const wheel = MeshBuilder.CreateCylinder(
      `wheel:${style}:${idx}`,
      { height: 0.32, diameter: 0.62, tessellation: 24 },
      scene
    );
    wheel.rotation.z = Math.PI / 2;
    wheel.material = wheelMat;
    wheel.parent = root;
    wheel.position = new Vector3(p.x, 0.35, p.z);

    const rim = MeshBuilder.CreateTorus(
      `rim:${style}:${idx}`,
      { diameter: 0.48, thickness: 0.08, tessellation: 18 },
      scene
    );
    rim.rotation.x = Math.PI / 2;
    rim.material = rimMat;
    rim.parent = wheel;
  }

  const strip = MeshBuilder.CreateBox(`strip:${style}`, { width: 1.5, height: 0.06, depth: 0.06 }, scene);
  strip.material = emissive;
  strip.parent = root;
  strip.position = new Vector3(0, 0.62, 1.62);

  const under = MeshBuilder.CreateBox(`underglow:${style}`, { width: 1.2, height: 0.04, depth: 2.5 }, scene);
  under.material = emissive;
  under.parent = root;
  under.position = new Vector3(0, 0.25, 0);
  under.isVisible = style === "premium";

  root.scaling = new Vector3(1, 1, 1);
  return root;
}

