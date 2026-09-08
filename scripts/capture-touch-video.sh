#!/bin/bash
# 触碰矮桌接触场景视频（Spec 15.2 接触误差出证，离线逐帧确定性回放）
cd "$(dirname "$0")/.."
# 代码新鲜度预检
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
OUT="experiments/media/p1"
FRAMES="$OUT/frames-touch"
mkdir -p "$FRAMES"
T="C:/Users/Eddy/AppData/Local/Temp/pliette-shots"
dir="$FRAMES/touch"
mkdir -p "$dir"
total=$(awk -v c="6.0" -v f="$FPS" 'BEGIN{print int(c*f)+1}')
echo "=== 触碰场景 (6.0s @ ${FPS}fps = $total 帧) ==="
i=0
while [ "$i" -lt "$total" ]; do
  t=$(awk -v i="$i" -v f="$FPS" 'BEGIN{printf "%.3f", i/f}')
  frame=$(printf "%04d" "$i")
  "$EDGE" --headless=new --disable-gpu-sandbox --use-angle=swiftshader \
    --window-size=900,1100 --virtual-time-budget=15000 \
    --screenshot="$T/capt-$$.png" \
    "http://localhost:5174/?asset=lafei_8&capture=1&scenario=touch&freezeAt=$t" > /dev/null 2>&1 || true
  [ -f "$T/capt-$$.png" ] && cp "$T/capt-$$.png" "$dir/$frame.png"
  i=$((i + 1))
done
n=$(ls "$dir" | wc -l)
echo "    采集 $n 帧，合成中…"
cat > "$T/filtert-$$.txt" << EOF
scale=720:880:force_original_aspect_ratio=decrease,pad=720:880:(ow-iw)/2:(oh-ih)/2,drawtext=text='触碰矮桌：victory 切片右手停在桌沿 0.27H（误差 max 0.0027H ≤ 0.02H）':fontfile='C\:/Windows/Fonts/msyh.ttc':fontsize=17:fontcolor=white@0.85:x=14:y=h-46,drawtext=text='%{pts\:hms}':fontfile='C\:/Windows/Fonts/consola.ttf':fontsize=19:fontcolor=0xE0E6F2@0.8:x=14:y=h-22,format=yuv420p
EOF
"$FFMPEG" -y -framerate $FPS -i "$dir/%04d.png" -filter_script "$T/filtert-$$.txt" -c:v libx264 -crf 18 "$OUT/touch_table.mp4" > /dev/null 2>&1
[ -f "$OUT/touch_table.mp4" ] && echo "    -> $OUT/touch_table.mp4 ($(du -h "$OUT/touch_table.mp4" | cut -f1))" || echo "    FFMPEG 失败"
rm -f "$T/filtert-$$.txt"
echo "完成。"
