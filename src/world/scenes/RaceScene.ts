import type { Engine } from "@babylonjs/core/Engines/engine";
import type { WebGPUEngine } from "@babylonjs/core/Engines/webgpuEngine";
import { ShadowGeneratorSceneComponent } from "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";
import { PostProcessRenderPipelineManagerSceneComponent } from "@babylonjs/core/PostProcesses/RenderPipeline/postProcessRenderPipelineManagerSceneComponent";
import { EffectLayerSceneComponent } from "@babylonjs/core/Layers/effectLayerSceneComponent";
import { DepthRendererSceneComponent } from "@babylonjs/core/Rendering/depthRendererSceneComponent";
// WebGPU dynamic texture extension (adds createDynamicTexture to WebGPUEngine)
import "@babylonjs/core/Engines/WebGPU/Extensions/engine.dynamicTexture";
import { FollowCamera } from "@babylonjs/core/Cameras/followCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { SpotLight } from "@babylonjs/core/Lights/spotLight";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Quaternion, Matrix } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import "@babylonjs/core/Meshes/thinInstanceMesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { CubeTexture } from "@babylonjs/core/Materials/Textures/cubeTexture";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline";
import { GlowLayer } from "@babylonjs/core/Layers/glowLayer";
import { Curve3 } from "@babylonjs/core/Maths/math.path";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { AdvancedDynamicTexture, TextBlock } from "@babylonjs/gui";
import type { PersistedState } from "../../runtime/storage";
import type { FrameContext, IGameScene } from "../../runtime/types";
import type { HudState } from "../../ui/UIManager";
import { applyQuality } from "../shared/quality";
import { createCarMesh } from "../meshes/cars";
import { InputManager } from "../../game/input/InputManager";
import { CarAudio } from "../../game/audio/CarAudio";
import { Minimap } from "../../ui/Minimap";
import * as CANNON from "cannon-es";

// Ensure Babylon scene components are included (some bundlers can otherwise tree-shake them away).
void ShadowGeneratorSceneComponent;
void PostProcessRenderPipelineManagerSceneComponent;
void EffectLayerSceneComponent;
void DepthRendererSceneComponent;

export type LoadingProgress = { label: string; progress: number };

export class RaceScene implements IGameScene {
  readonly state = "race" as const;
  readonly scene: Scene;
  private readonly hud: HudState = { speedMph: 0, gear: 1, lap: 1, lapTimeSeconds: 0 };
  private readonly input: InputManager;
  private readonly physics = new CANNON.World();
  private physicsAccumulator = 0;

  private roadSamples: Vector3[] = [];
  private startPosition = new Vector3(0, 0.6, 0);
  private lastProgressIndex = 0;

  private carRoot: TransformNode | null = null;
  private carVisual: TransformNode | null = null;
  private carBody: CANNON.Body | null = null;
  private carDriveSmoothed = 0;
  private carSteerSmoothed = 0;

  private dashText: TextBlock | null = null;
  private dashGear: TextBlock | null = null;
  private readonly audio = new CarAudio();
  private minimap: Minimap | null = null;

  // Physics materials - must be shared between configurePhysics and spawnCar
  private carMaterial: CANNON.Material | null = null;

  constructor(
    engine: Engine | WebGPUEngine,
    canvas: HTMLCanvasElement,
    persisted: PersistedState,
    private readonly onProgress: (p: LoadingProgress) => void
  ) {
    const scene = new Scene(engine);
    this.scene = scene;
    this.input = new InputManager(window, canvas);
    const quality = applyQuality(engine, scene, persisted.quality);
    this.input.attach();
    try {
      this.audio.arm();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[AUDIO] Failed to arm audio, continuing without SFX:", err);
    }

    // Initialize minimap
    this.minimap = tryCreateMinimap();

    scene.clearColor = new Color3(0.01, 0.02, 0.04).toColor4(1);
    scene.fogMode = Scene.FOGMODE_EXP2;
    scene.fogDensity = 0.008;
    scene.fogColor = new Color3(0.04, 0.04, 0.06);
    scene.ambientColor = new Color3(0.2, 0.18, 0.22);

    const hemi = new HemisphericLight("raceHemi", new Vector3(0, 1, 0), scene);
    hemi.intensity = 0.85;
    hemi.groundColor = new Color3(0.1, 0.1, 0.14);

    const sun = new DirectionalLight("sun", new Vector3(-0.6, -1, 0.55), scene);
    sun.position = new Vector3(50, 90, -55);
    sun.intensity = 2.8;
    sun.specular = new Color3(1, 1, 1);

    const shadowGen = new ShadowGenerator(quality.shadowMapSize, sun);
    shadowGen.useBlurExponentialShadowMap = true;
    shadowGen.blurKernel = 32;
    shadowGen.blurScale = 2;
    shadowGen.forceBackFacesOnly = true;
    shadowGen.darkness = 0.4;

    const camera = new FollowCamera("followCam", new Vector3(0, 4.2, -9), scene);
    camera.radius = 11;
    camera.heightOffset = 3.2;
    camera.rotationOffset = 180;
    camera.cameraAcceleration = 0.05;
    camera.maxCameraSpeed = 12;
    // Do NOT attach camera controls - this prevents user from hijacking camera with arrow keys
    // The camera should purely follow the car, not be controllable
    scene.activeCamera = camera;

    const glow = new GlowLayer("glow", scene, { blurKernelSize: 64 });
    glow.intensity = 0.85;

    if (quality.postFX) {
      const pipeline = new DefaultRenderingPipeline("fx", true, scene, [camera]);
      // Enhanced antialiasing for photorealistic smoothness
      pipeline.fxaaEnabled = true;
      pipeline.samples = 8; // Higher MSAA for ultra-smooth edges
      // Bloom for neon lights and reflections
      pipeline.bloomEnabled = true;
      pipeline.bloomThreshold = 0.6;
      pipeline.bloomWeight = 0.35;
      pipeline.bloomKernel = 64;
      // Chromatic aberration - very subtle for realism
      pipeline.chromaticAberrationEnabled = true;
      pipeline.chromaticAberration.aberrationAmount = 2.0;
      // Film grain - minimal for photorealistic look
      pipeline.grainEnabled = true;
      pipeline.grain.intensity = 2;
      // Enhanced image processing for photorealism
      pipeline.imageProcessingEnabled = true;
      pipeline.imageProcessing.toneMappingEnabled = true;
      pipeline.imageProcessing.toneMappingType = 1; // ACES tone mapping
      pipeline.imageProcessing.exposure = 1.15;
      pipeline.imageProcessing.contrast = 1.25;
      pipeline.imageProcessing.vignetteEnabled = true;
      pipeline.imageProcessing.vignetteWeight = 0.4;
      pipeline.imageProcessing.vignetteStretch = 0.5;
      pipeline.imageProcessing.vignetteColor = new Color3(0, 0, 0);
      // Sharpen for ultra-crisp photorealistic details
      pipeline.sharpenEnabled = true;
      if (pipeline.sharpen) {
        pipeline.sharpen.edgeAmount = 0.5;
        pipeline.sharpen.colorAmount = 0.8;
      }
      // Motion blur for racing realism
      pipeline.motionBlurEnabled = true;
      if (pipeline.motionBlur) {
        pipeline.motionBlur.motionStrength = 0.5;
        pipeline.motionBlur.motionBlurSamples = 32;
      }
      // Depth of field for cinematic photorealism
      pipeline.depthOfFieldEnabled = true;
      if (pipeline.depthOfField) {
        pipeline.depthOfField.focalLength = 150;
        pipeline.depthOfField.fStop = 2.8;
        pipeline.depthOfField.focusDistance = 12000;
      }
    }

    this.configurePhysics();
    this.onProgress({ label: "Building circuit…", progress: 0.1 });
    this.buildTrack(scene, shadowGen);
    this.onProgress({ label: "Spawning car…", progress: 0.65 });
    this.spawnCar(scene, persisted, shadowGen, camera);
    this.onProgress({ label: "Lighting the stadium…", progress: 0.82 });
    this.spawnStadiumLights(scene);

    void this.tryLoadEnvironment(scene);
    this.onProgress({ label: "Compiling shaders…", progress: 0.92 });
  }

  async initAsync(): Promise<void> {
    // Some browsers/drivers (notably Safari + WebGPU) can stall shader compilation in `whenReadyAsync()`.
    // Don't block the game loop forever; fade out the loading UI after a short grace period.
    await Promise.race([this.scene.whenReadyAsync(), sleep(1200)]);
    this.onProgress({ label: "Ready", progress: 1.0 });

    // Show minimap once scene is ready
    this.minimap?.show();
  }

  getHudState(): HudState {
    return this.hud;
  }

  private debugTimer = 0;
  private frameCount = 0;

  update(ctx: FrameContext): void {
    this.frameCount++;
    const input = this.input.read();

    // DEBUG: Log input every frame when throttle is pressed
    if (input.throttle > 0 && this.frameCount % 30 === 0) {
      console.log(`[INPUT] throttle=${input.throttle.toFixed(2)} brake=${input.brake.toFixed(2)} steer=${input.steer.toFixed(2)}`);
    }

    // Apply car controls BEFORE physics step
    this.applyCarControls(ctx.dt, input, this.frameCount);

    // Step physics at fixed rate
    const fixed = 1 / 60;
    this.physicsAccumulator += ctx.dt;
    while (this.physicsAccumulator >= fixed) {
      this.physics.step(fixed);
      this.physicsAccumulator -= fixed;
    }

    // Debug log every 0.5 second
    this.debugTimer += ctx.dt;
    if (this.debugTimer >= 0.5) {
      this.debugTimer = 0;
      const b = this.carBody;
      if (b) {
        console.log(
          `[CAR] throttle=${input.throttle.toFixed(1)} brake=${input.brake.toFixed(1)} steer=${input.steer.toFixed(2)} | ` +
          `drive=${this.carDriveSmoothed.toFixed(3)} | ` +
          `pos=(${b.position.x.toFixed(1)}, ${b.position.y.toFixed(2)}, ${b.position.z.toFixed(1)}) | ` +
          `vel=(${b.velocity.x.toFixed(2)}, ${b.velocity.y.toFixed(2)}, ${b.velocity.z.toFixed(2)}) speed=${b.velocity.length().toFixed(2)}`
        );
      }
    }

    this.syncVisuals(ctx.dt);
    this.updateHud(ctx.dt);
    this.updateMinimap();
  }

  dispose(): void {
    this.input.detach();
    this.audio.stop();
    this.minimap?.dispose();
    this.scene.dispose();
  }

  private configurePhysics(): void {
    this.physics.gravity.set(0, -9.82, 0);
    this.physics.broadphase = new CANNON.SAPBroadphase(this.physics);
    this.physics.allowSleep = false; // CRITICAL: Never let bodies sleep
    this.physics.solver.iterations = 20;
    this.physics.solver.tolerance = 0.0001;

    const groundMat = new CANNON.Material("ground");
    const carMat = new CANNON.Material("car");
    const railMat = new CANNON.Material("rail");

    // Store car material for use in spawnCar - CRITICAL for physics to work!
    this.carMaterial = carMat;

    this.physics.defaultContactMaterial.friction = 0.0;
    this.physics.defaultContactMaterial.restitution = 0.0;
    this.physics.addContactMaterial(
      new CANNON.ContactMaterial(groundMat, carMat, { friction: 0.0, restitution: 0.0, contactEquationStiffness: 1e8, contactEquationRelaxation: 3 })
    );
    this.physics.addContactMaterial(
      new CANNON.ContactMaterial(railMat, carMat, { friction: 0.0, restitution: 0.0 })
    );

    const groundBody = new CANNON.Body({ mass: 0, material: groundMat });
    const groundShape = new CANNON.Plane();
    groundBody.addShape(groundShape);
    groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.physics.addBody(groundBody);
  }

  private buildTrack(scene: Scene, shadowGen: ShadowGenerator): void {
    const trackWidth = 8.2;
    const points = [
      new Vector3(0, 0, 0),
      new Vector3(0, 0, 80),
      new Vector3(45, 0, 125),
      new Vector3(110, 0, 92),
      new Vector3(92, 0, 20),
      new Vector3(52, 0, -35),
      new Vector3(-18, 0, -42),
      new Vector3(-65, 0, 5),
      new Vector3(-52, 0, 60)
    ];

    const curve = Curve3.CreateCatmullRomSpline(points, 320, true);
    const samples = curve.getPoints();
    this.roadSamples = samples;
    this.startPosition = samples[0].add(new Vector3(0, 0.6, 0));

    const left: Vector3[] = [];
    const right: Vector3[] = [];
    for (let i = 0; i < samples.length; i++) {
      const p = samples[i];
      const next = samples[(i + 1) % samples.length];
      const t = next.subtract(p).normalize();
      const n = new Vector3(-t.z, 0, t.x).normalize();
      left.push(p.add(n.scale(trackWidth * 0.5)));
      right.push(p.add(n.scale(-trackWidth * 0.5)));
    }

    const road = MeshBuilder.CreateRibbon(
      "road",
      { pathArray: [left, right], closePath: true, closeArray: false, sideOrientation: Mesh.DOUBLESIDE },
      scene
    );
    road.receiveShadows = true;

    const asphalt = new PBRMaterial("asphalt", scene);
    asphalt.roughness = 0.85;
    asphalt.metallic = 0.0;
    asphalt.albedoColor = new Color3(0.12, 0.13, 0.15);
    asphalt.useMicroSurfaceFromReflectivityMapAlpha = false;
    asphalt.specularIntensity = 0.18;

    const asphaltTex = makeAsphaltTexture(scene);
    asphaltTex.uScale = 18;
    asphaltTex.vScale = 18;
    asphalt.albedoTexture = asphaltTex;
    asphalt.bumpTexture = asphaltTex;
    asphalt.bumpTexture.level = 0.35;
    road.material = asphalt;
    road.freezeWorldMatrix();

    const grass = MeshBuilder.CreateGround("grass", { width: 500, height: 500, subdivisions: 2 }, scene);
    grass.position.y = -0.02;
    grass.receiveShadows = true;
    const grassMat = new PBRMaterial("grassMat", scene);
    grassMat.roughness = 1.0;
    grassMat.metallic = 0;
    grassMat.albedoColor = new Color3(0.06, 0.18, 0.08);
    const grassTex = makeGrassTexture(scene);
    grassTex.uScale = 40;
    grassTex.vScale = 40;
    grassMat.albedoTexture = grassTex;
    grass.material = grassMat;
    grass.freezeWorldMatrix();

    const lineMat = new PBRMaterial("edgeLine", scene);
    lineMat.albedoColor = new Color3(0, 0, 0);
    lineMat.metallic = 0;
    lineMat.roughness = 0.35;
    lineMat.emissiveColor = new Color3(0.95, 0.95, 0.95);
    const leftLine = MeshBuilder.CreateTube(
      "leftLine",
      { path: left, radius: 0.06, tessellation: 8, cap: Mesh.NO_CAP, sideOrientation: Mesh.DOUBLESIDE },
      scene
    );
    leftLine.material = lineMat;
    const rightLine = MeshBuilder.CreateTube(
      "rightLine",
      { path: right, radius: 0.06, tessellation: 8, cap: Mesh.NO_CAP, sideOrientation: Mesh.DOUBLESIDE },
      scene
    );
    rightLine.material = lineMat;

    const start = MeshBuilder.CreateGround(
      "startLine",
      { width: trackWidth * 1.02, height: 3.0, subdivisions: 1 },
      scene
    );
    start.rotation.y = Math.atan2(
      samples[1].x - samples[0].x,
      samples[1].z - samples[0].z
    );
    start.position = samples[0].add(new Vector3(0, 0.011, 0));
    start.receiveShadows = true;
    const startMat = new PBRMaterial("startMat", scene);
    startMat.roughness = 0.7;
    startMat.metallic = 0.0;
    startMat.albedoTexture = makeCheckeredTexture(scene);
    startMat.albedoTexture.uScale = 8;
    startMat.albedoTexture.vScale = 3;
    start.material = startMat;
    start.freezeWorldMatrix();

    this.spawnStartBanner(scene, samples, trackWidth);

    this.spawnNeonRails(scene, trackWidth);
    this.spawnRailColliders(trackWidth);
  }

  private spawnStartBanner(scene: Scene, samples: Vector3[], trackWidth: number): void {
    const p0 = samples[0];
    const p1 = samples[1];
    const t = p1.subtract(p0).normalize();
    const n = new Vector3(-t.z, 0, t.x).normalize();
    const yaw = Math.atan2(t.x, t.z);

    const postMat = new PBRMaterial("bannerPost", scene);
    postMat.albedoColor = new Color3(0.06, 0.06, 0.08);
    postMat.metallic = 0.7;
    postMat.roughness = 0.5;

    const postL = MeshBuilder.CreateCylinder("postL", { diameter: 0.35, height: 6.5, tessellation: 14 }, scene);
    postL.material = postMat;
    postL.position = p0.add(n.scale(trackWidth * 0.5 + 0.8)).add(new Vector3(0, 3.25, 0));
    postL.rotation.y = yaw;

    const postR = MeshBuilder.CreateCylinder("postR", { diameter: 0.35, height: 6.5, tessellation: 14 }, scene);
    postR.material = postMat;
    postR.position = p0.add(n.scale(-trackWidth * 0.5 - 0.8)).add(new Vector3(0, 3.25, 0));
    postR.rotation.y = yaw;

    const banner = MeshBuilder.CreatePlane("banner", { width: trackWidth + 1.4, height: 1.2 }, scene);
    banner.position = p0.add(new Vector3(0, 6.0, 0));
    banner.rotation.y = yaw;
    const mat = new PBRMaterial("bannerMat", scene);
    mat.metallic = 0;
    mat.roughness = 0.65;
    mat.albedoTexture = makeCheckeredTexture(scene);
    mat.albedoTexture.uScale = 10;
    mat.albedoTexture.vScale = 2;
    mat.emissiveColor = new Color3(0.25, 0.25, 0.25);
    banner.material = mat;
  }

  private spawnNeonRails(scene: Scene, trackWidth: number): void {
    const railHeight = 0.6;
    const railThickness = 0.22;
    const offset = trackWidth * 0.5 + 0.62;

    const railOrangeMat = new PBRMaterial("railOrange", scene);
    railOrangeMat.metallic = 0.0;
    railOrangeMat.roughness = 0.2;
    railOrangeMat.albedoColor = new Color3(0.02, 0.02, 0.02);
    railOrangeMat.emissiveColor = new Color3(1.0, 0.34, 0.02);

    const railCyanMat = new PBRMaterial("railCyan", scene);
    railCyanMat.metallic = 0.0;
    railCyanMat.roughness = 0.2;
    railCyanMat.albedoColor = new Color3(0.02, 0.02, 0.02);
    railCyanMat.emissiveColor = new Color3(0.02, 0.75, 1.0);

    const baseOrange = MeshBuilder.CreateBox(
      "railOrangeBase",
      { width: railThickness, height: railHeight, depth: 4 },
      scene
    );
    baseOrange.material = railOrangeMat;
    const baseCyan = MeshBuilder.CreateBox("railCyanBase", { width: railThickness, height: railHeight, depth: 4 }, scene);
    baseCyan.material = railCyanMat;

    const stride = 3;
    for (let i = 0; i < this.roadSamples.length; i += stride) {
      const p = this.roadSamples[i];
      const next = this.roadSamples[(i + stride) % this.roadSamples.length];
      const seg = next.subtract(p);
      const len = Math.max(0.5, seg.length());
      const t = seg.scale(1 / Math.max(0.0001, len));
      const n = new Vector3(-t.z, 0, t.x).normalize();

      const yaw = Math.atan2(t.x, t.z);
      const rot = Quaternion.FromEulerAngles(0, yaw, 0);

      const leftPos = p.add(n.scale(offset)).add(new Vector3(0, railHeight * 0.5, 0));
      const rightPos = p.add(n.scale(-offset)).add(new Vector3(0, railHeight * 0.5, 0));

      const scale = new Vector3(1, 1, len / 4);
      baseOrange.thinInstanceAdd(Matrix.Compose(scale, rot, leftPos));
      baseCyan.thinInstanceAdd(Matrix.Compose(scale, rot, rightPos));
    }
  }

  private spawnRailColliders(trackWidth: number): void {
    const offset = trackWidth * 0.5 + 0.62;
    const thickness = 0.45;
    const height = 1.0;
    const stride = 7;
    const mat = new CANNON.Material("rail");

    for (let i = 0; i < this.roadSamples.length; i += stride) {
      const p = this.roadSamples[i];
      const next = this.roadSamples[(i + stride) % this.roadSamples.length];
      const seg = next.subtract(p);
      const len = Math.max(1.5, seg.length());
      const t = seg.scale(1 / Math.max(0.0001, len));
      const n = new Vector3(-t.z, 0, t.x).normalize();

      const yaw = Math.atan2(t.x, t.z);
      const q = new CANNON.Quaternion();
      q.setFromEuler(0, yaw, 0);
      const half = new CANNON.Vec3(thickness * 0.5, height * 0.5, len * 0.5);
      const shape = new CANNON.Box(half);

      for (const side of [1, -1]) {
        const pos = p.add(n.scale(offset * side));
        const body = new CANNON.Body({ mass: 0, material: mat });
        body.addShape(shape);
        body.position.set(pos.x, height * 0.5, pos.z);
        body.quaternion.copy(q);
        this.physics.addBody(body);
      }
    }
  }

  private spawnCar(scene: Scene, persisted: PersistedState, shadowGen: ShadowGenerator, camera: FollowCamera): void {
    const root = new TransformNode("carPhysicsRoot", scene);
    root.position = this.startPosition.clone();
    this.carRoot = root;

    const style =
      persisted.selectedCar === "premium" && persisted.premiumUnlocked ? "premium" : "basic";
    const visual = createCarMesh(scene, style);
    visual.parent = root;
    visual.position = Vector3.Zero();
    this.carVisual = visual;

    for (const m of visual.getChildMeshes()) {
      m.receiveShadows = true;
      shadowGen.addShadowCaster(m, true);
    }

    // Use the SAME material instance from configurePhysics - critical for contact materials to work!
    const body = new CANNON.Body({ mass: 950, material: this.carMaterial! });
    body.linearDamping = 0.0; // CRITICAL: ZERO damping
    body.angularDamping = 0.0; // CRITICAL: ZERO damping
    body.allowSleep = false;
    body.sleepSpeedLimit = 0; // Never sleep
    body.sleepTimeLimit = 0; // Never sleep
    // Lower car to sit on the road (box height is 0.6, so center at 0.25 puts bottom closer to ground)
    body.position.set(this.startPosition.x, 0.25, this.startPosition.z);
    body.addShape(new CANNON.Box(new CANNON.Vec3(0.85, 0.3, 1.55)));
    this.physics.addBody(body);
    this.carBody = body;

    camera.lockedTarget = root;

    const dashPlane = MeshBuilder.CreatePlane("dash", { width: 0.7, height: 0.24 }, scene);
    dashPlane.parent = visual;
    dashPlane.position = new Vector3(0, 0.95, -0.55);
    dashPlane.rotation = new Vector3(0, Math.PI, 0);
    const dashTex = AdvancedDynamicTexture.CreateForMesh(dashPlane, 512, 256);
    const speed = new TextBlock("dashSpeed", "0 MPH");
    speed.color = "white";
    speed.fontSize = 78;
    speed.top = "-12px";
    dashTex.addControl(speed);
    const gear = new TextBlock("dashGear", "G1");
    gear.color = "rgba(255,255,255,0.8)";
    gear.fontSize = 36;
    gear.top = "64px";
    dashTex.addControl(gear);
    this.dashText = speed;
    this.dashGear = gear;
  }

  private spawnStadiumLights(scene: Scene): void {
    const poleMat = new PBRMaterial("poleMat", scene);
    poleMat.albedoColor = new Color3(0.06, 0.06, 0.08);
    poleMat.metallic = 0.75;
    poleMat.roughness = 0.4;

    const headMat = new PBRMaterial("lightHeadMat", scene);
    headMat.albedoColor = new Color3(0.02, 0.02, 0.02);
    headMat.metallic = 0.1;
    headMat.roughness = 0.2;
    headMat.emissiveColor = new Color3(1.0, 0.98, 0.9);

    const pole = MeshBuilder.CreateCylinder("poleBase", { diameter: 0.35, height: 10, tessellation: 12 }, scene);
    pole.material = poleMat;

    const head = MeshBuilder.CreateBox("headBase", { width: 1.6, height: 0.55, depth: 0.6 }, scene);
    head.material = headMat;

    const stride = 28;
    for (let i = 0; i < this.roadSamples.length; i += stride) {
      const p = this.roadSamples[i];
      const next = this.roadSamples[(i + 1) % this.roadSamples.length];
      const t = next.subtract(p).normalize();
      const n = new Vector3(-t.z, 0, t.x).normalize();
      const side = i % (stride * 2) === 0 ? 1 : -1;
      const pos = p.add(n.scale((8.2 * 0.5 + 6.5) * side));

      const polePos = pos.add(new Vector3(0, 5, 0));
      pole.thinInstanceAdd(Matrix.Compose(new Vector3(1, 1, 1), Quaternion.Identity(), polePos));
      head.thinInstanceAdd(Matrix.Compose(new Vector3(1, 1, 1), Quaternion.Identity(), polePos.add(new Vector3(0, 5.2, 0))));

      const light = new SpotLight(
        `stadium:${i}`,
        polePos.add(new Vector3(0, 5.4, 0)),
        new Vector3(-t.x * side, -1.2, -t.z * side),
        Math.PI / 2.6,
        1.6,
        scene
      );
      light.intensity = 25000;
      light.diffuse = new Color3(1.0, 0.96, 0.9);
      light.specular = new Color3(1, 1, 1);
      light.range = 70;
    }
  }

  private applyCarControls(dt: number, input: { throttle: number; brake: number; steer: number; reset: boolean }, frame: number): void {
    if (!this.carBody) return;

    if (input.reset) {
      this.resetCar();
    }

    const body = this.carBody;
    const forward = body.quaternion.vmult(new CANNON.Vec3(0, 0, 1));
    const speedBefore = body.velocity.length();

    // Smooth input
    const driveTarget = clamp(input.throttle - input.brake, -1, 1);
    this.carDriveSmoothed = damp(this.carDriveSmoothed, driveTarget, 8.5, dt);
    this.carSteerSmoothed = damp(this.carSteerSmoothed, input.steer, 10.5, dt);

    // ARCADE DRIVING - use forces applied at center of mass
    const maxSpeed = 45; // m/s (~100 mph)
    const engineForce = 15000; // Newtons (mass=950kg, so 15000N = ~15.8 m/s² acceleration)

    // Accelerate - apply force at center of mass
    if (this.carDriveSmoothed > 0.01 && speedBefore < maxSpeed) {
      const force = new CANNON.Vec3(
        forward.x * engineForce * this.carDriveSmoothed,
        forward.y * engineForce * this.carDriveSmoothed,
        forward.z * engineForce * this.carDriveSmoothed
      );
      // Apply force at center of mass in WORLD coordinates
      body.applyForce(force, body.position);

      if (frame % 30 === 0) {
        console.log(`[ACCEL] frame=${frame} force=${engineForce * this.carDriveSmoothed} velBefore=${speedBefore.toFixed(3)} velAfter=${body.velocity.length().toFixed(3)} forward=(${forward.x.toFixed(2)},${forward.y.toFixed(2)},${forward.z.toFixed(2)})`);
      }
    }

    // Reverse - apply force backwards (same power as forward)
    if (this.carDriveSmoothed < -0.01 && speedBefore < maxSpeed * 0.6) {
      const reverseForce = engineForce; // Same power as forward acceleration
      const force = new CANNON.Vec3(
        -forward.x * reverseForce * Math.abs(this.carDriveSmoothed),
        -forward.y * reverseForce * Math.abs(this.carDriveSmoothed),
        -forward.z * reverseForce * Math.abs(this.carDriveSmoothed)
      );
      body.applyForce(force, body.position);
    }

    // Braking (only when S/brake pressed AND moving forward)
    if (input.brake > 0.1 && speedBefore > 0.5) {
      const brakeFactor = 1 - (0.08 * input.brake * dt * 60); // Normalised to ~60fps
      body.velocity.x *= Math.max(0.9, brakeFactor);
      body.velocity.z *= Math.max(0.9, brakeFactor);
    }

    // Steering
    const steerAmount = this.carSteerSmoothed * (2.0 + speedBefore * 0.02);
    body.angularVelocity.y = steerAmount;

    // Stabilise roll/pitch
    body.angularVelocity.x *= 0.85;
    body.angularVelocity.z *= 0.85;

    // Light drag (speed-dependent, about 2% per second at low speed)
    const drag = Math.pow(0.998, dt * 60);
    body.velocity.x *= drag;
    body.velocity.z *= drag;
  }

  private syncVisuals(dt: number): void {
    if (!this.carRoot || !this.carBody) return;
    const body = this.carBody;
    this.carRoot.position.set(body.position.x, body.position.y, body.position.z);
    this.carRoot.rotationQuaternion = new Quaternion(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w);

    if (this.carVisual) {
      const inv = body.quaternion.clone();
      inv.inverse();
      const localVel = inv.vmult(body.velocity);
      const forwardVel = localVel.z;
      const lateralVel = localVel.x;

      const pitch = clamp(-forwardVel / 55, -0.16, 0.16);
      const roll = clamp(lateralVel / 45, -0.18, 0.18);
      this.carVisual.rotation.x = damp(this.carVisual.rotation.x, pitch, 10, dt);
      this.carVisual.rotation.z = damp(this.carVisual.rotation.z, -roll, 10, dt);
    }
  }

  private updateHud(dt: number): void {
    if (!this.carBody) {
      this.hud.lapTimeSeconds += dt;
      return;
    }

    const body = this.carBody;
    const inv = body.quaternion.clone();
    inv.inverse();
    const localVel = inv.vmult(body.velocity);
    const mph = Math.abs(localVel.z) * 2.23693629;
    this.hud.speedMph = mph;
    this.hud.gear = speedToGear(mph);
    this.hud.lapTimeSeconds += dt;

    if (this.dashText) this.dashText.text = `${Math.round(mph)} MPH`;
    if (this.dashGear) this.dashGear.text = `G${this.hud.gear}`;
    this.audio.update({ speedMph: mph, throttle: this.carDriveSmoothed, slip: Math.abs(localVel.x) });

    const p = new Vector3(body.position.x, 0, body.position.z);
    const idx = nearestIndex(this.roadSamples, p, this.lastProgressIndex);
    if (this.lastProgressIndex > this.roadSamples.length * 0.85 && idx < this.roadSamples.length * 0.15) {
      this.hud.lap += 1;
      this.hud.lapTimeSeconds = 0;
    }
    this.lastProgressIndex = idx;
  }

  private updateMinimap(): void {
    if (!this.minimap || !this.carBody) return;

    const carPos = new Vector3(this.carBody.position.x, this.carBody.position.y, this.carBody.position.z);
    const carRotation = Math.atan2(
      this.carBody.quaternion.z,
      this.carBody.quaternion.w
    ) * 2;

    this.minimap.update(this.roadSamples, carPos, carRotation);
  }

  private resetCar(): void {
    if (!this.carBody) return;
    this.carBody.position.set(this.startPosition.x, this.startPosition.y, this.startPosition.z);
    this.carBody.velocity.set(0, 0, 0);
    this.carBody.angularVelocity.set(0, 0, 0);
    this.carBody.quaternion.setFromEuler(0, 0, 0);
    this.carDriveSmoothed = 0;
    this.carSteerSmoothed = 0;
    this.hud.lapTimeSeconds = 0;
    this.hud.lap = 1;
    this.lastProgressIndex = 0;
  }

  private async tryLoadEnvironment(scene: Scene): Promise<void> {
    try {
      const env = CubeTexture.CreateFromPrefilteredData("/env/environment.env", scene);
      scene.environmentTexture = env;
      scene.environmentIntensity = 1.2;
      await new Promise<void>((resolve) => {
        env.onLoadObservable.addOnce(() => resolve());
        env.onErrorObservable.addOnce(() => resolve());
      });
      scene.createDefaultSkybox(env, true, 900, 0.12);
    } catch {
      // Optional enhancement; keep the game playable without the HDRI.
    }
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function damp(current: number, target: number, lambda: number, dt: number): number {
  const t = 1 - Math.exp(-lambda * dt);
  return current + (target - current) * t;
}

function speedToGear(mph: number): number {
  if (mph < 14) return 1;
  if (mph < 28) return 2;
  if (mph < 46) return 3;
  if (mph < 66) return 4;
  if (mph < 92) return 5;
  return 6;
}

function nearestIndex(points: Vector3[], p: Vector3, hint: number): number {
  if (points.length === 0) return 0;
  const span = Math.min(points.length, 48);
  const start = Math.max(0, hint - span);
  const end = Math.min(points.length - 1, hint + span);
  let best = hint;
  let bestD = Number.POSITIVE_INFINITY;
  for (let i = start; i <= end; i++) {
    const d = Vector3.DistanceSquared(points[i], p);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

function makeAsphaltTexture(scene: Scene): Texture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new Texture("", scene);

  ctx.fillStyle = "#14161a";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = Math.random();
    const v = 20 + Math.floor(n * 55);
    img.data[i + 0] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v + 2;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);

  ctx.globalAlpha = 0.18;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 5;
  ctx.setLineDash([18, 18]);
  ctx.beginPath();
  ctx.moveTo(canvas.width * 0.5, 0);
  ctx.lineTo(canvas.width * 0.5, canvas.height);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.setLineDash([]);

  const tex = new Texture(canvas.toDataURL("image/png"), scene, true, false, Texture.TRILINEAR_SAMPLINGMODE);
  tex.wrapU = Texture.WRAP_ADDRESSMODE;
  tex.wrapV = Texture.WRAP_ADDRESSMODE;
  return tex;
}

function makeGrassTexture(scene: Scene): Texture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new Texture("", scene);
  ctx.fillStyle = "#0c2b14";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < 12000; i++) {
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;
    const g = 90 + Math.random() * 80;
    ctx.fillStyle = `rgba(20,${g},40,0.22)`;
    ctx.fillRect(x, y, 2, 2);
  }
  const tex = new Texture(canvas.toDataURL("image/png"), scene, true, false, Texture.TRILINEAR_SAMPLINGMODE);
  tex.wrapU = Texture.WRAP_ADDRESSMODE;
  tex.wrapV = Texture.WRAP_ADDRESSMODE;
  return tex;
}

function makeCheckeredTexture(scene: Scene): Texture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new Texture("", scene);

  const size = 32;
  for (let y = 0; y < canvas.height; y += size) {
    for (let x = 0; x < canvas.width; x += size) {
      const even = ((x / size) | 0) % 2 === ((y / size) | 0) % 2;
      ctx.fillStyle = even ? "#f3f3f3" : "#171717";
      ctx.fillRect(x, y, size, size);
    }
  }
  const tex = new Texture(canvas.toDataURL("image/png"), scene, true, false, Texture.TRILINEAR_SAMPLINGMODE);
  tex.wrapU = Texture.WRAP_ADDRESSMODE;
  tex.wrapV = Texture.WRAP_ADDRESSMODE;
  return tex;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
