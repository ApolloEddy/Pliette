/**
 * Stage：有限 3D 场景（Spec 5.4）。
 * 产品主镜头：透视 fov≈35°，位置 (0, 1.5H, 4.5H)，观察 (0, 0.8H, 0)。
 * 家具先由基础几何体构成，不透明材质，便于验证纸片演员的遮挡关系。
 */
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { PaperActor } from "../render/actor.js";

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly actorAnchor = new THREE.Group();
  private controls: OrbitControls | null = null;
  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x0b0d12);
    this.scene.background = new THREE.Color(0x0b0d12);

    this.camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    this.camera.position.set(0, 1.5, 4.5);
    this.camera.lookAt(0, 0.8, 0);

    // 地面与参考线
    const grid = new THREE.GridHelper(8, 16, 0x2a3040, 0x1a2030);
    grid.position.y = 0.001;
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(8, 8),
      new THREE.MeshBasicMaterial({ color: 0x10131a }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.002;
    this.scene.add(grid, floor);

    // 简单家具占位：一张桌子和一把椅子（P3 前的遮挡验证道具）
    // 布局要点：椅背/桌面在角色平面（z=0）之后（z<0），保证坐姿纸片人在镜头前不被遮挡
    // 椅子位置与 A08.seat 锚点（x=0.6）对齐，椅面高 0.42
    const furniture = new THREE.Group();
    const deskMat = new THREE.MeshBasicMaterial({ color: 0x24303e });
    const desk = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, 0.5), deskMat);
    desk.position.set(0.6, 0.72, -0.85);
    const deskLegMat = new THREE.MeshBasicMaterial({ color: 0x1b2430 });
    for (const [dx, dz] of [[-0.4, -0.2], [0.4, -0.2], [-0.4, 0.2], [0.4, 0.2]] as const) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.7, 0.05), deskLegMat);
      leg.position.set(desk.position.x + dx, 0.35, desk.position.z + dz);
      furniture.add(leg);
    }
    furniture.add(desk);
    const chair = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.06, 0.42), new THREE.MeshBasicMaterial({ color: 0x2c3a4a }));
    chair.position.set(0.6, 0.42, -0.28);
    const chairBack = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 0.05), new THREE.MeshBasicMaterial({ color: 0x2c3a4a }));
    chairBack.position.set(0.6, 0.68, -0.5);
    const chairLegMat = new THREE.MeshBasicMaterial({ color: 0x1b2430 });
    for (const [dx, dz] of [[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17], [0.17, 0.17]] as const) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.4, 0.04), chairLegMat);
      leg.position.set(chair.position.x + dx, 0.2, chair.position.z + dz);
      furniture.add(leg);
    }
    furniture.add(chair, chairBack);

    // 矮桌（Q 版比例，0.27H 高）：触碰接触交互的目标（victory[0.7-1.2] 右手稳定高度 = 0.27H）
    const lowTableMat = new THREE.MeshBasicMaterial({ color: 0x3a4a5e });
    const lowTable = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.27, 0.35), lowTableMat);
    lowTable.position.set(0.85, 0.135, -0.35);
    const lowTableEdge = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.06), new THREE.MeshBasicMaterial({ color: 0x4c6076 }));
    lowTableEdge.position.set(0.85, 0.27, -0.18);
    furniture.add(lowTable, lowTableEdge);
    this.scene.add(furniture);
    this.scene.add(this.actorAnchor);

    this.resize();
  }

  /** 角色整体转身（世界朝向由场景控制器唯一持有，Spec 7.9 actorWorld） */
  turnActor(angleRad: number): void {
    this.actorAnchor.rotation.y = angleRad;
  }

  setFreeCamera(enabled: boolean): void {
    if (enabled && !this.controls) {
      this.controls = new OrbitControls(this.camera, this.canvas);
      this.controls.target.set(0, 0.8, 0);
    }
    if (!enabled && this.controls) {
      this.controls.dispose();
      this.controls = null;
      this.camera.position.set(0, 1.5, 4.5);
      this.camera.lookAt(0, 0.8, 0);
    }
  }

  resize(): void {
    const w = this.canvas.clientWidth || 800;
    const h = this.canvas.clientHeight || 600;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render(dtSec: number, actor?: PaperActor): void {
    this.resize();
    if (this.controls) this.controls.update();
    if (actor) actor.update(dtSec);
    this.renderer.render(this.scene, this.camera);
  }
}
