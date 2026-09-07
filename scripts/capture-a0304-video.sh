#!/bin/bash
# A03/A04 验收视频：走路 + 挥手 + 任意相位取消（离线逐帧确定性对照）
cd "$(dirname "$0")/.."
EDGE="C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
FFMPEG="$(node -p "require('ffmpeg-static')")"
FPS=24
OUT="experiments/media/p1"
FRAMES="$OUT/frames-a0304"
mkdir -p "$FRAMES"
T="C:/Users/Eddy/AppData/Local/Temp/pliette-shots"

# 场景: 标签|总时长|取消相位（0=不取消）
SCENES=(
  "a04_walk_wave_cancel|6.0|2.2"
  "a03_interrupt_20|3.5|0.5"
  "a03_interrupt_50|4.0|1.2"
  "a03_interrupt_80|4.6|1.9"
)

FILTER_SET=("$@")
for entry in "${SCENES[@]}"; do
  label="${entry%%|*}"; rest="${entry#*|}"; totalT="${rest%%|*}"; cancelT="${rest#*|}"
  if [ ${#FILTER_SET[@]} -gt 0 ]; then
    keep=0; for f in "$@"; do [ "$f" = "$label" ] && keep=1; done
    [ "$keep" = "1" ] || continue
  fi
  dir="$FRAMES/$label"
  mkdir -p "$dir"
  total=$(awk -v c="$totalT" -v f="$FPS" 'BEGIN{print int(c*f)+1}')
  echo "=== $label (${totalT}s, cancel@${cancelT}s @ ${FPS}fps = $total 帧) ==="
  i=0
  while [ "$i" -lt "$total" ]; do
    t=$(awk -v i="$i" -v f="$FPS" 'BEGIN{printf "%.3f", i/f}')
    frame=$(printf "%04d" "$i")
    "$EDGE" --headless=new --disable-gpu-sandbox --use-angle=swiftshader \
      --window-size=768,1000 --virtual-time-budget=12000 \
      --screenshot="$T/capc-$$.png" \
      "http://localhost:5174/?asset=lafei_8&view=flat&capture=1&anim=walk&gesture=wave&hand=right&cancelAt=$cancelT&freezeAt=$t" > /dev/null 2>&1 || true
    [ -f "$T/capc-$$.png" ] && cp "$T/capc-$$.png" "$dir/$frame.png"
    i=$((i + 1))
  done
  n=$(ls "$dir" | wc -l)
  echo "    采集 $n 帧，合成中…"
  if awk -v c="$cancelT" 'BEGIN{exit !(c>0)}'; then
    title="A04/A03: walk + wave(stand切片) + 取消@${cancelT}s — 行走持续，右臂平滑交还"
  else
    title="A04: walk + wave(stand切片)"
  fi
  cat > "$T/filterc-$$.txt" << EOF
scale=720:960:force_original_aspect_ratio=decrease,pad=720:960:(ow-iw)/2:(oh-ih)/2,drawtext=text='$title':fontfile='C\:/Windows/Fonts/msyh.ttc':fontsize=19:fontcolor=white@0.85:x=14:y=h-46,drawtext=text='%{pts\:hms}':fontfile='C\:/Windows/Fonts/consola.ttf':fontsize=19:fontcolor=0xE0E6F2@0.8:x=14:y=h-22,format=yuv420p
EOF
  "$FFMPEG" -y -framerate $FPS -i "$dir/%04d.png" -filter_script "$T/filterc-$$.txt" -c:v libx264 -crf 18 "$OUT/$label.mp4" > /dev/null 2>&1
  [ -f "$OUT/$label.mp4" ] && echo "    -> $OUT/$label.mp4 ($(du -h "$OUT/$label.mp4" | cut -f1))" || echo "    FFMPEG 失败: $label"
  rm -f "$T/filterc-$$.txt"
done
echo "完成。"
