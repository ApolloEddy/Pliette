#!/bin/bash
# P1 候选视频合成：帧采集（离线逐帧，确定性对照——非实时帧率证据，Spec 15.3）+ ffmpeg 合成
# 用法: bash scripts/capture-p1-video.sh [motion_name ...]   # 无参数=全部
cd "$(dirname "$0")/.."
EDGE="C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
FFMPEG="$(node -p "require('ffmpeg-static')")"
FPS="${FPS:-15}"
OUT="experiments/media/p1"
FRAMES="$OUT/frames"
mkdir -p "$FRAMES"
T="C:/Users/Eddy/AppData/Local/Temp/pliette-shots"

# 无参数=全部默认集；参数支持 name 或 name:duration（时长缺省时从 public/motions/<name>.json 读取）
ALL_MOTIONS=(
  "nod_c1:0.8"
  "nod_c2:0.8"
  "wave_right_primitive_c1:1.6"
  "wave_right_primitive_c2:1.391"
  "point_right_c1:1.4"
  "lean_listen_c1:1.6"
  "shrink_shy_c1:1.8"
  "idle_subtle_c1:2.4"
)

MOTIONS=()
if [ ${#@} -gt 0 ]; then
  for spec in "$@"; do
    name="${spec%%:*}"
    dur="${spec##*:}"
    if [ "$name" = "$dur" ]; then
      dur=$(node -p "JSON.parse(require('fs').readFileSync('public/motions/$name.json','utf8')).durationSec")
    fi
    MOTIONS+=("$name:$dur")
  done
else
  MOTIONS=("${ALL_MOTIONS[@]}")
fi

for entry in "${MOTIONS[@]}"; do
  name="${entry%%:*}"
  duration="${entry##*:}"
  dir="$FRAMES/$name"
  mkdir -p "$dir"
  total=$(awk -v d="$duration" -v f="$FPS" 'BEGIN{print int(d*2*f)+1}')
  echo "=== $name ($duration s × 2 loops @ ${FPS}fps = $total 帧) ==="
  i=0
  while [ "$i" -lt "$total" ]; do
    t=$(awk -v i="$i" -v f="$FPS" -v d="$duration" 'BEGIN{t=i/f; while(t>=d) t-=d; printf "%.3f", t}')
    frame=$(printf "%04d" "$i")
    "$EDGE" --headless=new --disable-gpu-sandbox --use-angle=swiftshader \
      --window-size=768,1000 --virtual-time-budget=9000 \
      --screenshot="$T/cap-$$.png" \
      "http://localhost:5174/?asset=lafei_8&view=flat&capture=1&motion=$name&poseAt=$t" > /dev/null 2>&1 || true
    if [ -f "$T/cap-$$.png" ]; then
      cp "$T/cap-$$.png" "$dir/$frame.png"
    else
      echo "  SKIP frame $frame (截图失败)"
    fi
    i=$((i + 1))
  done
  n=$(ls "$dir" | wc -l)
  echo "    采集完成 $n 帧，合成中…"
  cat > "$T/filter-$$.txt" << EOF
scale=720:960:force_original_aspect_ratio=decrease,pad=720:960:(ow-iw)/2:(oh-ih)/2,drawtext=text='$name  |  spine-ts 3.6.53':fontfile='C\:/Windows/Fonts/arial.ttf':fontsize=22:fontcolor=white@0.85:x=14:y=h-46,drawtext=text='%{pts\:hms}':fontfile='C\:/Windows/Fonts/consola.ttf':fontsize=19:fontcolor=0xE0E6F2@0.8:x=14:y=h-22,format=yuv420p
EOF
  "$FFMPEG" -y -framerate $FPS -i "$dir/%04d.png" -filter_script "$T/filter-$$.txt" -c:v libx264 -crf 18 "$OUT/$name.mp4" > /dev/null 2>&1
  [ -f "$OUT/$name.mp4" ] && echo "    -> $OUT/$name.mp4 ($(du -h "$OUT/$name.mp4" | cut -f1))" || echo "    FFMPEG 失败: $name"
  rm -f "$T/filter-$$.txt"
done
echo "完成。逐帧为离线渲染对照证据；实时性能另行在目标机器测量（Spec 15.3/15.4）。"
