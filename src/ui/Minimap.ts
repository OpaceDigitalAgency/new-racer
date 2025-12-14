import { Vector3 } from "@babylonjs/core/Maths/math.vector";

export class Minimap {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private container: HTMLDivElement;

  constructor(parentElement: HTMLElement) {
    // Create container
    this.container = document.createElement("div");
    this.container.style.position = "absolute";
    this.container.style.bottom = "20px";
    this.container.style.right = "20px";
    this.container.style.width = "200px";
    this.container.style.height = "200px";
    this.container.style.backgroundColor = "rgba(0, 0, 0, 0.7)";
    this.container.style.border = "2px solid rgba(0, 200, 255, 0.8)";
    this.container.style.borderRadius = "8px";
    this.container.style.padding = "8px";
    this.container.style.boxShadow = "0 0 20px rgba(0, 200, 255, 0.5)";
    this.container.style.display = "none";

    // Create canvas
    this.canvas = document.createElement("canvas");
    this.canvas.width = 184;
    this.canvas.height = 184;
    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";

    this.container.appendChild(this.canvas);
    parentElement.appendChild(this.container);

    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("Failed to get 2D context");
    this.ctx = ctx;
  }

  show(): void {
    this.container.style.display = "block";
  }

  hide(): void {
    this.container.style.display = "none";
  }

  update(trackPoints: Vector3[], carPosition: Vector3, carRotation: number): void {
    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;

    // Clear canvas
    ctx.fillStyle = "rgba(5, 10, 20, 0.95)";
    ctx.fillRect(0, 0, width, height);

    if (trackPoints.length === 0) return;

    // Calculate bounds
    let minX = Infinity, maxX = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;

    for (const p of trackPoints) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z);
      maxZ = Math.max(maxZ, p.z);
    }

    const rangeX = maxX - minX;
    const rangeZ = maxZ - minZ;
    const scale = Math.min(width, height) * 0.85 / Math.max(rangeX, rangeZ);
    const centerX = width / 2;
    const centerZ = height / 2;

    // Transform world coordinates to canvas coordinates
    const toCanvasX = (x: number) => centerX + (x - (minX + maxX) / 2) * scale;
    const toCanvasZ = (z: number) => centerZ + (z - (minZ + maxZ) / 2) * scale;

    // Draw track
    ctx.strokeStyle = "rgba(100, 100, 120, 0.8)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i < trackPoints.length; i++) {
      const p = trackPoints[i];
      const x = toCanvasX(p.x);
      const z = toCanvasZ(p.z);
      if (i === 0) {
        ctx.moveTo(x, z);
      } else {
        ctx.lineTo(x, z);
      }
    }
    ctx.closePath();
    ctx.stroke();

    // Draw track fill
    ctx.fillStyle = "rgba(40, 40, 50, 0.4)";
    ctx.fill();

    // Draw start/finish line
    if (trackPoints.length > 0) {
      const start = trackPoints[0];
      ctx.fillStyle = "rgba(0, 255, 100, 0.9)";
      ctx.beginPath();
      ctx.arc(toCanvasX(start.x), toCanvasZ(start.z), 5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw car
    const carX = toCanvasX(carPosition.x);
    const carZ = toCanvasZ(carPosition.z);

    ctx.save();
    ctx.translate(carX, carZ);
    ctx.rotate(carRotation);

    // Car triangle pointing forward
    ctx.fillStyle = "rgba(0, 200, 255, 0.95)";
    ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(-5, 5);
    ctx.lineTo(5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.restore();

    // Draw border
    ctx.strokeStyle = "rgba(0, 200, 255, 0.6)";
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, width, height);
  }

  dispose(): void {
    this.container.remove();
  }
}

