/**
 * LabRecorder：把 3D 画布实时合成到带 HUD 的输出画布并用 MediaRecorder 录制（Spec 15.3）。
 * 真实渲染录屏：不加速、不补帧；WebM 产物（mp4 转码由外部 ffmpeg 任务完成）。
 */
export class LabRecorder {
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private composite: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private raf = 0;
  private mime = "video/webm";

  constructor() {
    this.composite = document.createElement("canvas");
    this.composite.width = 1280;
    this.composite.height = 800;
    const ctx = this.composite.getContext("2d");
    if (!ctx) throw new Error("无法创建录像合成画布");
    this.ctx = ctx;
  }

  get recording(): boolean {
    return this.recorder != null;
  }

  start(source: HTMLCanvasElement, getHud: () => string, onStopped?: () => void): void {
    if (this.recorder) return;
    const stream = this.composite.captureStream(60);
    const mime = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((m) =>
      MediaRecorder.isTypeSupported(m),
    );
    this.mime = mime ?? "video/webm";
    this.recorder = new MediaRecorder(stream, { mimeType: this.mime, videoBitsPerSecond: 8_000_000 });
    this.chunks = [];
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.recorder.onstop = () => {
      cancelAnimationFrame(this.raf);
      const blob = new Blob(this.chunks, { type: this.mime });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `pliette-lab-${new Date().toISOString().replace(/[:.]/g, "-")}.webm`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      onStopped?.();
    };
    this.recorder.start(250);

    const drawFrame = () => {
      const { width: cw, height: ch } = this.composite;
      this.ctx.fillStyle = "#0b0d12";
      this.ctx.fillRect(0, 0, cw, ch);
      const scale = Math.min(cw / source.width, ch / source.height);
      const w = source.width * scale;
      const h = source.height * scale;
      this.ctx.drawImage(source, (cw - w) / 2, (ch - h) / 2, w, h);
      this.ctx.font = "13px Consolas, monospace";
      this.ctx.fillStyle = "rgba(230,235,245,0.92)";
      this.ctx.textBaseline = "bottom";
      getHud()
        .split("\n")
        .forEach((line, i) => this.ctx.fillText(line, 14, ch - 14 - (getHud().split("\n").length - 1 - i) * 18));
      this.raf = requestAnimationFrame(drawFrame);
    };
    drawFrame();
  }

  stop(): void {
    this.recorder?.stop();
    this.recorder = null;
  }
}
