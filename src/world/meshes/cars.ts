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

  // High-quality car paint with clearcoat for photorealistic look
  const paint = new PBRMaterial(`carPaint:${style}`, scene);
  paint.metallic = 0.95;
  paint.roughness = style === "premium" ? 0.15 : 0.25;
  paint.albedoColor = style === "premium" ? new Color3(0.85, 0.05, 0.05) : new Color3(0.05, 0.15, 0.85);
  paint.clearCoat.isEnabled = true;
  paint.clearCoat.intensity = 1.0;
  paint.clearCoat.roughness = 0.03;
  paint.clearCoat.isTintEnabled = true;
  paint.clearCoat.tintColor = new Color3(1, 1, 1);
  paint.clearCoat.tintThickness = 0.8;

  const emissive = new PBRMaterial(`carGlow:${style}`, scene);
  emissive.metallic = 0.0;
  emissive.roughness = 0.8;
  emissive.albedoColor = new Color3(0, 0, 0);
  emissive.emissiveColor = style === "premium" ? new Color3(1.0, 0.42, 0.0) : new Color3(0.0, 0.7, 1.0);
  emissive.emissiveIntensity = 2.5;

  // Glass material for windows
  const glass = new PBRMaterial(`carGlass:${style}`, scene);
  glass.metallic = 0.0;
  glass.roughness = 0.05;
  glass.alpha = 0.25;
  glass.albedoColor = new Color3(0.05, 0.08, 0.12);
  glass.reflectivityColor = new Color3(0.9, 0.9, 0.9);

  // More detailed body with rounded edges
  const body = MeshBuilder.CreateBox(
    `carBody:${style}`,
    { width: 1.6, height: 0.55, depth: 3.2 },
    scene
  );
  body.material = paint;
  body.parent = root;
  body.position = new Vector3(0, 0.55, 0);

  // Sleeker cabin with glass
  const cabin = MeshBuilder.CreateBox(`carCabin:${style}`, { width: 1.25, height: 0.5, depth: 1.4 }, scene);
  cabin.material = paint;
  cabin.parent = root;
  cabin.position = new Vector3(0, 0.95, -0.3);

  // Windscreen
  const windscreen = MeshBuilder.CreateBox(`windscreen:${style}`, { width: 1.2, height: 0.45, depth: 0.05 }, scene);
  windscreen.material = glass;
  windscreen.parent = root;
  windscreen.position = new Vector3(0, 0.95, 0.4);
  windscreen.rotation.x = -0.2;

  // Side windows
  const windowL = MeshBuilder.CreateBox(`windowL:${style}`, { width: 0.05, height: 0.4, depth: 1.2 }, scene);
  windowL.material = glass;
  windowL.parent = root;
  windowL.position = new Vector3(-0.6, 0.95, -0.3);

  const windowR = MeshBuilder.CreateBox(`windowR:${style}`, { width: 0.05, height: 0.4, depth: 1.2 }, scene);
  windowR.material = glass;
  windowR.parent = root;
  windowR.position = new Vector3(0.6, 0.95, -0.3);

  // Front bumper with more detail
  const bumper = MeshBuilder.CreateBox(`carBumper:${style}`, { width: 1.7, height: 0.3, depth: 0.5 }, scene);
  bumper.material = paint;
  bumper.parent = root;
  bumper.position = new Vector3(0, 0.45, 1.6);

  // Front splitter for racing look
  const splitter = MeshBuilder.CreateBox(`splitter:${style}`, { width: 1.8, height: 0.05, depth: 0.35 }, scene);
  splitter.material = paint;
  splitter.parent = root;
  splitter.position = new Vector3(0, 0.28, 1.75);

  // Rear bumper
  const rear = MeshBuilder.CreateBox(`carRear:${style}`, { width: 1.7, height: 0.32, depth: 0.55 }, scene);
  rear.material = paint;
  rear.parent = root;
  rear.position = new Vector3(0, 0.46, -1.6);

  // Rear wing/spoiler for racing look
  const wingBase = MeshBuilder.CreateBox(`wingBase:${style}`, { width: 0.15, height: 0.4, depth: 0.1 }, scene);
  wingBase.material = paint;
  wingBase.parent = root;
  wingBase.position = new Vector3(0, 0.85, -1.65);

  const wing = MeshBuilder.CreateBox(`wing:${style}`, { width: 1.5, height: 0.08, depth: 0.45 }, scene);
  wing.material = paint;
  wing.parent = root;
  wing.position = new Vector3(0, 1.15, -1.7);
  wing.rotation.x = 0.15;

  // High-quality tyre material
  const wheelMat = new PBRMaterial(`wheel:${style}`, scene);
  wheelMat.albedoColor = new Color3(0.01, 0.01, 0.01);
  wheelMat.metallic = 0.05;
  wheelMat.roughness = 0.95;

  // Chrome/alloy rim material
  const rimMat = new PBRMaterial(`rim:${style}`, scene);
  rimMat.albedoColor = new Color3(0.25, 0.25, 0.25);
  rimMat.metallic = 0.95;
  rimMat.roughness = 0.15;
  rimMat.emissiveColor = style === "premium" ? new Color3(1.0, 0.35, 0.0) : new Color3(0, 0, 0);
  rimMat.emissiveIntensity = style === "premium" ? 1.5 : 0;

  const wheelPositions: Array<{ x: number; z: number }> = [
    { x: -0.75, z: 1.05 },
    { x: 0.75, z: 1.05 },
    { x: -0.75, z: -1.05 },
    { x: 0.75, z: -1.05 }
  ];

  for (const [idx, p] of wheelPositions.entries()) {
    // Higher detail wheels
    const wheel = MeshBuilder.CreateCylinder(
      `wheel:${style}:${idx}`,
      { height: 0.35, diameter: 0.65, tessellation: 32 },
      scene
    );
    wheel.rotation.z = Math.PI / 2;
    wheel.material = wheelMat;
    wheel.parent = root;
    wheel.position = new Vector3(p.x, 0.35, p.z);

    // Multi-spoke rim design
    const rim = MeshBuilder.CreateTorus(
      `rim:${style}:${idx}`,
      { diameter: 0.5, thickness: 0.1, tessellation: 24 },
      scene
    );
    rim.rotation.x = Math.PI / 2;
    rim.material = rimMat;
    rim.parent = wheel;

    // Brake disc
    const disc = MeshBuilder.CreateCylinder(
      `disc:${style}:${idx}`,
      { height: 0.05, diameter: 0.4, tessellation: 32 },
      scene
    );
    disc.rotation.z = Math.PI / 2;
    disc.material = rimMat;
    disc.parent = wheel;
    disc.position = new Vector3(0, 0, 0);
  }

  // LED headlight strips
  const stripL = MeshBuilder.CreateBox(`stripL:${style}`, { width: 0.08, height: 0.08, depth: 0.5 }, scene);
  stripL.material = emissive;
  stripL.parent = root;
  stripL.position = new Vector3(-0.65, 0.58, 1.65);

  const stripR = MeshBuilder.CreateBox(`stripR:${style}`, { width: 0.08, height: 0.08, depth: 0.5 }, scene);
  stripR.material = emissive;
  stripR.parent = root;
  stripR.position = new Vector3(0.65, 0.58, 1.65);

  // Tail lights
  const tailL = MeshBuilder.CreateBox(`tailL:${style}`, { width: 0.08, height: 0.15, depth: 0.35 }, scene);
  const tailMat = emissive.clone(`tailMat:${style}`);
  tailMat.emissiveColor = new Color3(1.0, 0.05, 0.05);
  tailMat.emissiveIntensity = 2.0;
  tailL.material = tailMat;
  tailL.parent = root;
  tailL.position = new Vector3(-0.7, 0.55, -1.65);

  const tailR = MeshBuilder.CreateBox(`tailR:${style}`, { width: 0.08, height: 0.15, depth: 0.35 }, scene);
  tailR.material = tailMat;
  tailR.parent = root;
  tailR.position = new Vector3(0.7, 0.55, -1.65);

  // Underglow
  const under = MeshBuilder.CreateBox(`underglow:${style}`, { width: 1.3, height: 0.04, depth: 2.8 }, scene);
  under.material = emissive;
  under.parent = root;
  under.position = new Vector3(0, 0.25, 0);
  under.isVisible = style === "premium";

  // Side mirrors
  const mirrorMat = paint.clone(`mirrorMat:${style}`);
  const mirrorL = MeshBuilder.CreateBox(`mirrorL:${style}`, { width: 0.12, height: 0.12, depth: 0.18 }, scene);
  mirrorL.material = mirrorMat;
  mirrorL.parent = root;
  mirrorL.position = new Vector3(-0.7, 0.95, 0.3);

  const mirrorR = MeshBuilder.CreateBox(`mirrorR:${style}`, { width: 0.12, height: 0.12, depth: 0.18 }, scene);
  mirrorR.material = mirrorMat;
  mirrorR.parent = root;
  mirrorR.position = new Vector3(0.7, 0.95, 0.3);

  root.scaling = new Vector3(1, 1, 1);
  return root;
}

