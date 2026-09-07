/**
 * PaperActor：把完整 Spine 画布作为 CanvasTexture 贴到 Three.js 纸片平面（Spec 5.1/5.2）。
 * 首版：两个方向相反的平面（正面 +Z / 背面 −Z），材质只渲染各自正面。
 * "背面镜像"仅为演示管线，明确标注不把镜像正面当作真实背面（Spec 4.2）。
 */
import * as THREE from "three";
import { SpineView, type AssetSourceConfig } from "./spineView.js";

export class PaperActor {
  readonly view: SpineView;
  private texture: THREE.CanvasTexture;
  private group = new THREE.Group();
  private frontPlane: THREE.Mesh;
  private backPlane: THREE.Mesh;
  private frontMaterial: THREE.MeshBasicMaterial;
  private backMaterial: THREE.MeshBasicMaterial;

  /** 角色标定身高 H（世界单位），默认 1（Spec 4.4） */
  heightH = 1;

  constructor(heightH = 1, canvasWidth = 768, canvasHeight = 1024) {
    this.heightH = heightH;
    this.view = new SpineView(canvasWidth, canvasHeight);
    this.view.transparentCanvas = true; // 3D 纸片：画布透明，只保留角色像素
    this.texture = new THREE.CanvasTexture(this.view.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.generateMipmaps = false;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.premultiplyAlpha = true;

    const aspect = canvasWidth / canvasHeight;
    const geo = new THREE.PlaneGeometry(heightH * aspect, heightH);
    this.frontMaterial = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      depthWrite: false,
      side: THREE.FrontSide,
      premultipliedAlpha: true,
      alphaTest: 0.01,
    });
    this.backMaterial = this.frontMaterial.clone();
    this.frontPlane = new THREE.Mesh(geo, this.frontMaterial);
    this.backPlane = new THREE.Mesh(geo, this.backMaterial);
    this.backPlane.rotation.y = Math.PI; // 法线 −Z
    this.backPlane.visible = false;
    this.group.add(this.frontPlane, this.backPlane);
    this.group.position.y = heightH / 2; // 脚底基准贴地
    this.group.renderOrder = 10;
  }

  get object3D(): THREE.Group {
    return this.group;
  }

  /** 演示用镜像背面（Spec 5.1 允许的两面共面方案；lafei 真实背面未核实前仅作演示） */
  setMirroredBack(visible: boolean): void {
    this.backPlane.visible = visible;
  }

  async loadFromUrls(cfg: AssetSourceConfig): Promise<void> {
    await this.view.loadFromUrls(cfg);
    this.texture.needsUpdate = true;
  }

  /** 每帧：先完成 Spine 绘制，再标记纹理更新（Spec 5.2 顺序） */
  update(dtSec: number): void {
    const before = this.view.canvas;
    this.view.render(dtSec);
    if (before === this.view.canvas) this.texture.needsUpdate = true;
  }

  dispose(): void {
    this.view.dispose();
    this.texture.dispose();
    this.frontMaterial.dispose();
    this.backMaterial.dispose();
  }
}
