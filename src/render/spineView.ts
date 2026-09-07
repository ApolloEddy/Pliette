/**
 * SpineView：官方 spine-ts 3.6 WebGL 渲染到独立透明画布（Spec 5.1）。
 * 稳定取景：跨动作使用同一画布范围与脚底基准，不做逐帧包围盒适配（Spec 5.2）。
 */
import { spine36 as spine } from "spine-webgl";
import { loadSkeleton, scaleAtlasText, type AssetBundle } from "../assets/loader.js";

/** 运行时类在 3.6.53 构建中位于 spine.webgl 子命名空间（见 vendor PROVENANCE.md） */
const webgl = (spine as unknown as { webgl: Record<string, any> }).webgl;

export interface AssetSourceConfig {
  name: string;
  jsonUrl: string;
  atlasUrl: string;
  /** 图集页名（如 spineboy-pma.png）→ 图片 URL */
  imagePathFor: (pageName: string) => string;
  premultipliedAlpha: boolean;
  /** 贴图超分倍率：PNG 放大 s 倍时自动缩放 atlas 坐标（1 = 原生） */
  textureScale?: number;
}

export interface ProbeOffset {
  /** 附加旋转（度） */
  rot?: number;
  /** 附加平移（Spine 原生单位） */
  tx?: number;
  ty?: number;
}

const fetchCache = new Map<string, Promise<string>>();
function fetchTextCached(url: string): Promise<string> {
  let p = fetchCache.get(url);
  if (!p) {
    p = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
      return r.text();
    });
    fetchCache.set(url, p);
  }
  return p;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`贴图加载失败: ${url}`));
    img.src = url;
  });
}

export class SpineView {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext;
  private sceneRenderer: any;
  private skeleton: spine.Skeleton | null = null;
  state: spine.AnimationState | null = null;
  private bundle: AssetBundle | null = null;
  private disposables: (() => void)[] = [];

  backgroundColor: [number, number, number] = [0.16, 0.17, 0.21];
  premultipliedAlpha = true;
  debug = false;
  paused = false;
  speed = 1;
  /** true 时清屏 alpha=0：3D 纸片纹理需要透明背景；平面基线模式保持不透明做黑/白底验收 */
  transparentCanvas = false;
  /** 骨骼名 → 探针偏移（Spec 4.3：小幅正负探针确认控制对象与方向） */
  probes = new Map<string, ProbeOffset>();

  private camera: any;
  private baseViewportW = 0;
  private baseViewportH = 0;

  constructor(width = 768, height = 1024, existingCanvas?: HTMLCanvasElement) {
    this.canvas = existingCanvas ?? document.createElement("canvas");
    this.canvas.width = width;
    this.canvas.height = height;
    const gl = this.canvas.getContext("webgl", {
      alpha: true,
      premultipliedAlpha: true,
      antialias: true,
      preserveDrawingBuffer: false,
    });
    if (!gl) throw new Error("无法创建 WebGL 上下文");
    this.gl = gl as WebGLRenderingContext;
    this.sceneRenderer = new webgl.SceneRenderer(this.canvas, this.gl, true);
    this.camera = this.sceneRenderer.camera;
  }

  /** 拉取并解析资产（图片预加载后经官方 TextureAtlas / SkeletonJson）。 */
  async loadFromUrls(cfg: AssetSourceConfig): Promise<AssetBundle> {
    const [jsonText, atlasTextRaw] = await Promise.all([fetchTextCached(cfg.jsonUrl), fetchTextCached(cfg.atlasUrl)]);
    const atlasText = scaleAtlasText(atlasTextRaw, cfg.textureScale ?? 1);
    const rawJson = JSON.parse(jsonText);
    const pageNames = atlasText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.includes(":") && /\.(png|jpg)$/i.test(l));
    const images = new Map<string, HTMLImageElement>();
    await Promise.all(
      pageNames.map(async (n) => {
        images.set(n, await loadImage(cfg.imagePathFor(n)));
      }),
    );
    const bundle = loadSkeleton({
      name: cfg.name,
      skeletonJson: rawJson,
      atlasText,
      createTexture: (pageName) => {
        const img = images.get(pageName);
        if (!img) throw new Error(`图集页 ${pageName} 没有对应图片`);
        return new webgl.GLTexture(this.gl, img);
      },
    });
    this.attach(bundle, cfg.premultipliedAlpha);
    return bundle;
  }

  attach(bundle: AssetBundle, premultipliedAlpha: boolean): void {
    this.disposeSkeleton();
    this.bundle = bundle;
    this.premultipliedAlpha = premultipliedAlpha;
    const stateData = new spine.AnimationStateData(bundle.skeletonData);
    stateData.defaultMix = 0.2;
    this.state = new spine.AnimationState(stateData);
    this.skeleton = new spine.Skeleton(bundle.skeletonData);

    // 固定取景（Spec 5.2）：按 setup 包围盒计算一次，跨动作稳定
    const data = bundle.skeletonData;
    const w = Math.max(data.width, 1);
    const h = Math.max(data.height, 1);
    const fit = (this.canvas.height * 0.9) / h;
    this.baseViewportW = this.canvas.width / fit;
    this.baseViewportH = this.canvas.height / fit;

    if (this.state) this.setAnimation(null, false);
  }

  get skeletonData(): spine.SkeletonData | null {
    return this.bundle?.skeletonData ?? null;
  }

  get currentBundle(): AssetBundle | null {
    return this.bundle;
  }

  setAnimation(name: string | null, loop: boolean): void {
    if (!this.state) return;
    if (name == null) {
      this.state.setEmptyAnimation(0, 0);
      return;
    }
    this.state.setAnimation(0, name, loop);
  }

  get currentTrack(): any {
    return this.state?.tracks[0] ?? null;
  }

  /** 推进一次并绘制。dt 已由上层做暂停/大步保护。 */
  render(dtSec: number): void {
    const { gl } = this;
    gl.clearColor(this.backgroundColor[0], this.backgroundColor[1], this.backgroundColor[2], this.transparentCanvas ? 0 : 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (!this.skeleton || !this.state) return;

    const dt = Math.max(0, Math.min(dtSec, 1 / 20)) * this.speed; // 暂停恢复不补大步（Spec 9.1）
    if (!this.paused) this.state.update(dt);
    this.state.apply(this.skeleton);
    this.applyProbes(this.skeleton);
    this.skeleton.updateWorldTransform();

    const renderer = this.sceneRenderer as any;
    renderer.begin();
    // 每帧固定视口（Spec 5.2：不得逐帧自动适配包围盒）
    this.camera.viewportWidth = this.baseViewportW;
    this.camera.viewportHeight = this.baseViewportH;
    const dataHeight = this.bundle!.skeletonData.height;
    this.camera.position.x = 0;
    this.camera.position.y = dataHeight * 0.55;
    this.camera.update();
    renderer.drawSkeleton(this.skeleton, this.premultipliedAlpha);
    if (this.debug) renderer.drawSkeletonDebug(this.skeleton, this.premultipliedAlpha, null);
    renderer.end();
  }

  private applyProbes(skeleton: spine.Skeleton): void {
    for (const [boneName, offset] of this.probes) {
      const bone = skeleton.findBone(boneName);
      if (!bone) continue;
      if (offset.rot) bone.rotation += offset.rot;
      if (offset.tx) bone.x += offset.tx;
      if (offset.ty) bone.y += offset.ty;
    }
  }

  /** 暂停状态下推进一帧（时间控制：逐帧检查） */
  stepOnce(dtSec = 1 / 60): void {
    if (this.state) this.state.update(dtSec * this.speed);
  }

  /** 同步截取当前画布（须紧跟 render 调用；一次性探针/录像用途，非逐帧路径） */
  snapshotBlob(): Promise<Blob | null> {
    return new Promise((resolve) => this.canvas.toBlob((b) => resolve(b), "image/png"));
  }

  private disposeSkeleton(): void {
    if (this.bundle?.atlas && typeof (this.bundle.atlas as any).dispose === "function") {
      (this.bundle.atlas as any).dispose();
    }
    this.bundle = null;
    this.skeleton = null;
    this.state = null;
    this.probes.clear();
  }

  dispose(): void {
    this.disposeSkeleton();
    for (const d of this.disposables) d();
    this.disposables = [];
    const ext = this.gl.getExtension("WEBGL_lose_context");
    ext?.loseContext();
  }
}
