#!/bin/bash
# A08 验收视频：走向椅子坐下（3D 场景，离线逐帧确定性回放）
cd "$(dirname "$0")/.."
# 代码新鲜度预检：dev server 缓存可能滞后（vite 文件监视在部分环境不可靠）
MARKER="${MARKER:-walkSpeed: 0.115}"
served=$(curl -s "http://localhost:5174/src/lab/ui.ts" | grep -c "$MARKER")
if [ "$served" -eq 0 ]; then
  echo "⛔ dev server 代码非最新（缺少标记: $MARKER），请重启 vite 后重试"
  exit 1
fi
echo "✓ dev server 代码新鲜度检查通过"
EDGE="C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
FFMPEG="$(node -p "require('ffmpeg-static')")"
FPS=24
OUT="experiments/media/p1"
FRAMES="$OUT/frames-a08"
mkdir -p "$FRAMES"
T="C:/Users/Eddy/AppData/Local/Temp/pliette-shots"
dir="$FRAMES/a08"
mkdir -p "$dir"
total=$(awk -v c="21.8" -v f="$FPS" 'BEGIN{print int(c*f)+1}')
echo "=== A08 (21.8s @ ${FPS}fps = $total 帧) ==="
i=0
while [ "$i" -lt "$total" ]; do
  t=$(awk -v i="$i" -v f="$FPS" 'BEGIN{printf "%.3f", i/f}')
  frame=$(printf "%04d" "$i")
  "$EDGE" --headless=new --disable-gpu-sandbox --use-angle=swiftshader \
    --window-size=900,1100 --virtual-time-budget=15000 \
    --screenshot="$T/cap8-$$.png" \
    "http://localhost:5174/?asset=lafei_8&capture=1&scenario=a08&freezeAt=$t" > /dev/null 2>&1 || true
  [ -f "$T/cap8-$$.png" ] && cp "$T/cap8-$$.png" "$dir/$frame.png"
  i=$((i + 1))
done
n=$(ls "$dir" | wc -l)
echo "    采集 $n 帧，合成中…"
cat > "$T/filter8-$$.txt" << EOF
scale=720:880:force_original_aspect_ratio=decrease,pad=720:880:(ow-iw)/2:(oh-ih)/2,drawtext=text='A08: 走向椅子坐下（P3 场景）':fontfile='C\:/Windows/Fonts/msyh.ttc':fontsize=20:fontcolor=white@0.85:x=14:y=h-46,drawtext=text='%{pts\:hms}':fontfile='C\:/Windows/Fonts/consola.ttf':fontsize=19:fontcolor=0xE0E6F2@0.8:x=14:y=h-22,format=yuv420p
EOF
"$FFMPEG" -y -framerate $FPS -i "$dir/%04d.png" -filter_script "$T/filter8-$$.txt" -c:v libx264 -crf 18 "$OUT/a08_scenario.mp4" > /dev/null 2>&1
[ -f "$OUT/a08_scenario.mp4" ] && echo "    -> $OUT/a08_scenario.mp4 ($(du -h "$OUT/a08_scenario.mp4" | cut -f1))" || echo "    FFMPEG 失败"
rm -f "$T/filter8-$$.txt"
echo "完成。"
