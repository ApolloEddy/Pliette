#!/bin/bash
# 原动画切片叠加组合的确定性视频：stand 基础 + 通道叠加（离线逐帧对照证据）
# 用法: bash scripts/capture-overlay-video.sh
cd "$(dirname "$0")/.."
# 代码新鲜度预检：dev server 缓存可能滞后
MARKER="${MARKER:-walkSpeed: 0.115}"
served=$(curl -s "http://localhost:5174/src/lab/ui.ts" | grep -c "$MARKER")
if [ "$served" -eq 0 ]; then
  echo "⛔ dev server 代码非最新，请重启 vite 后重试"
  exit 1
fi
echo "✓ dev server 代码新鲜度检查通过"
EDGE="C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
FFMPEG="$(node -p "require('ffmpeg-static')")"
FPS=24
CLIP=4.0
OUT="experiments/media/p1"
FRAMES="$OUT/frames-overlay"
mkdir -p "$FRAMES"
T="C:/Users/Eddy/AppData/Local/Temp/pliette-shots"

# 组合: 标签|叠加 overlay 参数|视频标注
COMBOS=(
  "touch_reaction|touch:head:0:0.67|stand + touch头部切片（被摸头开心）"
  "dizzy|yun:head:0.4:2.0|stand + yun头部切片（晕乎乎）"
  "shy_lookdown|sit:head:0:1.33|stand + sit头部切片（低头害羞）"
  "walk_life|normal:head:0:2.0|walk + normal头部切片（行走中的头部细节）"
  "idle_sway|dance:torso:0:1.17|stand + dance躯干切片（待机摇摆）"
)

FILTER_SET=("$@")
for entry in "${COMBOS[@]}"; do
  label="${entry%%|*}"; rest="${entry#*|}"; overlay="${rest%%|*}"; title="${rest#*|}"
  if [ ${#FILTER_SET[@]} -gt 0 ]; then
    keep=0; for f in "$@"; do [ "$f" = "$label" ] && keep=1; done
    [ "$keep" = "1" ] || continue
  fi
  dir="$FRAMES/$label"
  mkdir -p "$dir"
  total=$(awk -v c="$CLIP" -v f="$FPS" 'BEGIN{print int(c*f)+1}')
  echo "=== $label ($overlay, ${CLIP}s @ ${FPS}fps = $total 帧) ==="
  i=0
  while [ "$i" -lt "$total" ]; do
    t=$(awk -v i="$i" -v f="$FPS" 'BEGIN{printf "%.3f", i/f}')
    frame=$(printf "%04d" "$i")
    "$EDGE" --headless=new --disable-gpu-sandbox --use-angle=swiftshader \
      --window-size=768,1000 --virtual-time-budget=12000 \
      --screenshot="$T/capo-$$.png" \
      "http://localhost:5174/?asset=lafei_8&view=flat&capture=1&anim=stand&overlay=$overlay&freezeAt=$t" > /dev/null 2>&1 || true
    [ -f "$T/capo-$$.png" ] && cp "$T/capo-$$.png" "$dir/$frame.png"
    i=$((i + 1))
  done
  n=$(ls "$dir" | wc -l)
  echo "    采集 $n 帧，合成中…"
  cat > "$T/filtero-$$.txt" << EOF
scale=720:960:force_original_aspect_ratio=decrease,pad=720:960:(ow-iw)/2:(oh-ih)/2,drawtext=text='$title':fontfile='C\:/Windows/Fonts/msyh.ttc':fontsize=21:fontcolor=white@0.85:x=14:y=h-46,drawtext=text='%{pts\:hms}':fontfile='C\:/Windows/Fonts/consola.ttf':fontsize=19:fontcolor=0xE0E6F2@0.8:x=14:y=h-22,format=yuv420p
EOF
  "$FFMPEG" -y -framerate $FPS -i "$dir/%04d.png" -filter_script "$T/filtero-$$.txt" -c:v libx264 -crf 18 "$OUT/overlay-$label.mp4" > /dev/null 2>&1
  [ -f "$OUT/overlay-$label.mp4" ] && echo "    -> $OUT/overlay-$label.mp4 ($(du -h "$OUT/overlay-$label.mp4" | cut -f1))" || echo "    FFMPEG 失败: $label"
  rm -f "$T/filtero-$$.txt"
done
echo "完成。"
