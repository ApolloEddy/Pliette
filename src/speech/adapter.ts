/**
 * 语音适配器（Spec 10.4 / P4）：以"实际播放时钟"驱动说话状态，不假定具体 TTS。
 * MockTts 用字数估算时长（离线可用）；真实 TTS 接入时实现同一接口
 * （utterance 开始/进度/结束/取消，取消时同步失效旧的说话状态）。
 */
export interface SpeechState {
  active: boolean;
  utteranceId: string | null;
  text: string;
  /** 0~1 播放进度 */
  progress: number;
}

export interface SpeechAdapter {
  readonly name: string;
  speak(text: string): string;
  cancel(): void;
  readonly state: SpeechState;
}

type Listener = (state: SpeechState) => void;

export class MockTts implements SpeechAdapter {
  readonly name = "mock-tts";
  private _state: SpeechState = { active: false, utteranceId: null, text: "", progress: 0 };
  private timer: number | null = null;
  private listeners: Listener[] = [];
  private seq = 0;

  /** 每字秒数（中文语速近似） */
  constructor(private secPerChar = 0.11) {}

  get state(): SpeechState {
    return { ...this._state };
  }

  onListen(fn: Listener): void {
    this.listeners.push(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn(this._state);
  }

  speak(text: string): string {
    this.cancel();
    const id = `utt-${++this.seq}`;
    const duration = Math.max(0.8, text.length * this.secPerChar);
    this._state = { active: true, utteranceId: id, text, progress: 0 };
    this.emit();
    const started = performance.now();
    const tick = () => {
      if (this._state.utteranceId !== id) return;
      const p = Math.min(1, (performance.now() - started) / (duration * 1000));
      this._state = { ...this._state, progress: p };
      this.emit();
      if (p >= 1) {
        this._state = { active: false, utteranceId: null, text: "", progress: 1 };
        this.emit();
        this.timer = null;
        return;
      }
      this.timer = window.setTimeout(tick, 80);
    };
    this.timer = window.setTimeout(tick, 80);
    return id;
  }

  cancel(): void {
    if (this.timer != null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this._state.active) {
      this._state = { active: false, utteranceId: null, text: "", progress: 0 };
      this.emit();
    }
  }
}
