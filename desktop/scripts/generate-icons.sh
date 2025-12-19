#!/bin/bash

###############################################################################
# 应用图标生成脚本
#
# 功能：从 public/logo.svg 自动生成 Tauri 应用所需的所有图标文件
#
# 依赖：
# - ImageMagick (magick 命令)
# - iconutil (macOS，用于生成 .icns)
#
# 用法：
#   ./scripts/generate-icons.sh
###############################################################################

set -e

# 颜色定义
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}🎨 Creative Studio 图标生成工具${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# 检查 ImageMagick
if ! command -v magick &> /dev/null; then
    echo -e "${RED}❌ 错误: ImageMagick 未安装${NC}"
    echo ""
    echo "请先安装 ImageMagick:"
    echo "  macOS:   brew install imagemagick"
    echo "  Ubuntu:  sudo apt-get install imagemagick"
    echo "  Windows: choco install imagemagick"
    echo ""
    exit 1
fi

echo -e "${GREEN}✓ ImageMagick 已安装${NC}"

# 检查源文件
if [ ! -f "public/logo.svg" ]; then
    echo -e "${RED}❌ 错误: 找不到 public/logo.svg${NC}"
    exit 1
fi

echo -e "${GREEN}✓ 找到源文件 public/logo.svg${NC}"
echo ""

# 创建 icons 目录
mkdir -p src-tauri/icons
echo -e "${BLUE}📁 创建目录: src-tauri/icons${NC}"
echo ""

# 生成 PNG 图标
echo -e "${BLUE}📦 生成 PNG 图标...${NC}"

echo "  生成 32x32.png..."
magick public/logo.svg -resize 32x32 -background none src-tauri/icons/32x32.png

echo "  生成 128x128.png..."
magick public/logo.svg -resize 128x128 -background none src-tauri/icons/128x128.png

echo "  生成 128x128@2x.png (256x256)..."
magick public/logo.svg -resize 256x256 -background none src-tauri/icons/128x128@2x.png

echo "  生成 icon-512.png (临时文件)..."
magick public/logo.svg -resize 512x512 -background none src-tauri/icons/icon-512.png

echo "  生成 icon-1024.png (临时文件)..."
magick public/logo.svg -resize 1024x1024 -background none src-tauri/icons/icon-1024.png

echo -e "${GREEN}✓ PNG 图标生成完成${NC}"
echo ""

# 生成 ICO (Windows)
echo -e "${BLUE}🪟 生成 Windows ICO...${NC}"
magick public/logo.svg -background none -define icon:auto-resize=256,128,64,48,32,16 src-tauri/icons/icon.ico
echo -e "${GREEN}✓ icon.ico 生成完成${NC}"
echo ""

# 生成 ICNS (macOS)
if command -v iconutil &> /dev/null; then
    echo -e "${BLUE}🍎 生成 macOS ICNS...${NC}"

    # 创建临时目录
    rm -rf icon.iconset
    mkdir icon.iconset

    # 生成各种尺寸
    echo "  生成 icon.iconset..."
    magick public/logo.svg -resize 16x16 -background none icon.iconset/icon_16x16.png
    magick public/logo.svg -resize 32x32 -background none icon.iconset/icon_16x16@2x.png
    magick public/logo.svg -resize 32x32 -background none icon.iconset/icon_32x32.png
    magick public/logo.svg -resize 64x64 -background none icon.iconset/icon_32x32@2x.png
    magick public/logo.svg -resize 128x128 -background none icon.iconset/icon_128x128.png
    magick public/logo.svg -resize 256x256 -background none icon.iconset/icon_128x128@2x.png
    magick public/logo.svg -resize 256x256 -background none icon.iconset/icon_256x256.png
    magick public/logo.svg -resize 512x512 -background none icon.iconset/icon_256x256@2x.png
    magick public/logo.svg -resize 512x512 -background none icon.iconset/icon_512x512.png
    magick public/logo.svg -resize 1024x1024 -background none icon.iconset/icon_512x512@2x.png

    # 转换为 icns
    echo "  转换为 .icns..."
    iconutil -c icns icon.iconset -o src-tauri/icons/icon.icns

    # 清理临时文件
    rm -rf icon.iconset

    echo -e "${GREEN}✓ icon.icns 生成完成${NC}"
else
    echo -e "${YELLOW}⚠️  iconutil 未安装，跳过 ICNS 生成${NC}"
    echo -e "${YELLOW}   在 macOS 上运行此脚本以生成 .icns 文件${NC}"
    echo -e "${YELLOW}   或使用在线工具: https://cloudconvert.com/png-to-icns${NC}"
fi

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}✅ 图标生成完成！${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo "生成的文件："
ls -lh src-tauri/icons/ | grep -v "^total" | grep -E "\.(png|ico|icns)$"

echo ""
echo -e "${BLUE}下一步:${NC}"
echo "  运行 ${GREEN}pnpm tauri build${NC} 构建应用"
echo "  构建的安装包会自动使用这些图标"
echo ""
