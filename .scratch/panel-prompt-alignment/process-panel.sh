#!/usr/bin/env bash
# 单格落盘处理：找到本批目录最新 PNG → 指纹查重 → 900x600 JPG 覆盖 panel_web → 双仓回写。
# 用法: process-panel.sh <key> <png_dir> <seen_sha_file> <new_sha_log>
set -euo pipefail
KEY="$1"; DIR="$2"; SEEN="$3"; LOG="$4"
BG=/home/wall/vibe/babyGame
BOOK=/home/wall/vibe/books/0-3-game-book

PNG=$(ls -t "$DIR"/*.png 2>/dev/null | head -1)
if [ -z "${PNG:-}" ]; then echo "LANDING-FAIL $KEY: 目录无 PNG"; exit 2; fi
SHA=$(sha256sum "$PNG" | awk '{print $1}')

# 查重：与本批已落盘的任何 PNG、以及旧图指纹重复都算串写/未变，废弃
if [ -s "$SEEN" ] && grep -q "^$SHA$" "$SEEN"; then echo "DUP $KEY $SHA"; exit 3; fi
if grep -q " $SHA$" "$BG/.scratch/panel-prompt-alignment/ch07-old-sha.txt" 2>/dev/null; then echo "DUP-OLD $KEY $SHA"; exit 3; fi

# 尺寸规格：PNG 统一 1152x768；JPG 900x600 质量 90
convert "$PNG" -resize 1152x768! "$BG/.scratch/panel-prompt-alignment/tmp-$KEY.png"
mv "$BG/.scratch/panel-prompt-alignment/tmp-$KEY.png" "$PNG"
convert "$PNG" -resize 900x600! -quality 90 "$BG/.scratch/panel-prompt-alignment/tmp-$KEY.jpg"

# 覆盖 babyGame panel_web + 书稿仓双写
mv "$BG/.scratch/panel-prompt-alignment/tmp-$KEY.jpg" "$BG/assets/art/panel_web/$KEY.jpg"
cp "$PNG" "$BOOK/assets/art/panel/$KEY.png"
cp "$BG/assets/art/panel_web/$KEY.jpg" "$BOOK/assets/art/panel_web/$KEY.jpg"

echo "$SHA" >> "$SEEN"
echo "$KEY $SHA" >> "$LOG"
# 回写后指纹必须与账一致
DISK=$(sha256sum "$BG/assets/art/panel_web/$KEY.jpg" | awk '{print $1}')
if [ "$DISK" != "$(sha256sum "$BOOK/assets/art/panel_web/$KEY.jpg" | awk '{print $1}')" ]; then echo "WRITEBACK-MISMATCH $KEY"; exit 4; fi
echo "OK $KEY $SHA"
