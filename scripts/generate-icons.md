# 📱 应用图标生成指南

## 🎯 目标

从 `public/logo.svg` 生成 Tauri 应用所需的各平台图标文件。

## 📦 需要生成的文件

Tauri 需要以下格式的图标：

| 文件 | 尺寸 | 用途 |
|------|------|------|
| `32x32.png` | 32×32 | Windows 小图标 |
| `128x128.png` | 128×128 | macOS/Linux 图标 |
| `128x128@2x.png` | 256×256 | macOS Retina 图标 |
| `icon.icns` | 多尺寸 | macOS 应用图标 |
| `icon.ico` | 多尺寸 | Windows 应用图标 |

## 🛠️ 方法 1：使用在线工具（推荐）

### 步骤：

1. **访问 Icon Generator 网站**
   - https://icon.kitchen/
   - https://realfavicongenerator.net/
   - https://redketchup.io/icon-converter

2. **上传 `public/logo.svg`**

3. **设置参数**
   - 背景：透明或白色
   - 形状：圆角矩形（12px）
   - 尺寸：选择所有需要的尺寸

4. **下载并放置**
   ```bash
   # 下载图标包后，解压到
   src-tauri/icons/
   ```

## 🛠️ 方法 2：使用命令行工具

### 安装 ImageMagick

```bash
# macOS
brew install imagemagick

# Ubuntu/Debian
sudo apt-get install imagemagick

# Windows (使用 Chocolatey)
choco install imagemagick
```

### 生成 PNG 图标

```bash
# 进入项目根目录
cd /path/to/creative-studio

# 创建 icons 目录
mkdir -p src-tauri/icons

# 生成 32x32
magick public/logo.svg -resize 32x32 src-tauri/icons/32x32.png

# 生成 128x128
magick public/logo.svg -resize 128x128 src-tauri/icons/128x128.png

# 生成 256x256 (128@2x)
magick public/logo.svg -resize 256x256 src-tauri/icons/128x128@2x.png

# 生成 512x512 (用于 icon.icns)
magick public/logo.svg -resize 512x512 src-tauri/icons/icon-512.png

# 生成 1024x1024 (用于 icon.icns)
magick public/logo.svg -resize 1024x1024 src-tauri/icons/icon-1024.png
```

### 生成 ICO 文件 (Windows)

```bash
# 使用 ImageMagick 生成多尺寸 ICO
magick public/logo.svg -define icon:auto-resize=256,128,64,48,32,16 src-tauri/icons/icon.ico
```

### 生成 ICNS 文件 (macOS)

macOS 需要使用专门工具：

#### 方法 A：使用 iconutil (仅 macOS)

```bash
# 创建临时目录
mkdir icon.iconset

# 生成各种尺寸
magick public/logo.svg -resize 16x16 icon.iconset/icon_16x16.png
magick public/logo.svg -resize 32x32 icon.iconset/icon_16x16@2x.png
magick public/logo.svg -resize 32x32 icon.iconset/icon_32x32.png
magick public/logo.svg -resize 64x64 icon.iconset/icon_32x32@2x.png
magick public/logo.svg -resize 128x128 icon.iconset/icon_128x128.png
magick public/logo.svg -resize 256x256 icon.iconset/icon_128x128@2x.png
magick public/logo.svg -resize 256x256 icon.iconset/icon_256x256.png
magick public/logo.svg -resize 512x512 icon.iconset/icon_256x256@2x.png
magick public/logo.svg -resize 512x512 icon.iconset/icon_512x512.png
magick public/logo.svg -resize 1024x1024 icon.iconset/icon_512x512@2x.png

# 转换为 icns
iconutil -c icns icon.iconset -o src-tauri/icons/icon.icns

# 清理临时文件
rm -rf icon.iconset
```

#### 方法 B：使用 png2icns (跨平台)

```bash
# 安装
npm install -g png2icns

# 生成 icns
png2icns src-tauri/icons/icon.icns src-tauri/icons/icon-1024.png
```

## 🛠️ 方法 3：使用 Tauri 自动生成

### 步骤 1：准备源图标

在 `src-tauri/icons/` 目录放置一个 `icon.png`（至少 1024×1024）

### 步骤 2：使用 Tauri CLI

```bash
# Tauri 会自动生成所有需要的图标格式
pnpm tauri icon src-tauri/icons/icon.png
```

## 🎨 推荐配置

### 最佳图标设计建议

1. **尺寸**：源文件至少 1024×1024
2. **内边距**：留 10% 的空白边距
3. **背景**：
   - 浅色主题：使用淡色背景
   - 深色主题：使用深色背景
   - 或使用透明背景

4. **细节**：
   - 在小尺寸（32px）下仍清晰可辨
   - 避免过于复杂的细节

### 当前 logo.svg 优化建议

由于 logo.svg 已经是淡色设计，建议：
- ✅ 直接使用（背景已是淡色）
- ✅ 或添加轻微边框增强可见度

## 📋 完整自动化脚本

创建 `scripts/generate-icons.sh`:

```bash
#!/bin/bash

echo "🎨 从 logo.svg 生成应用图标..."

# 创建目录
mkdir -p src-tauri/icons

# 生成 PNG 图标
echo "📦 生成 PNG 图标..."
magick public/logo.svg -resize 32x32 src-tauri/icons/32x32.png
magick public/logo.svg -resize 128x128 src-tauri/icons/128x128.png
magick public/logo.svg -resize 256x256 src-tauri/icons/128x128@2x.png
magick public/logo.svg -resize 512x512 src-tauri/icons/icon-512.png
magick public/logo.svg -resize 1024x1024 src-tauri/icons/icon-1024.png

# 生成 ICO
echo "🪟 生成 Windows ICO..."
magick public/logo.svg -define icon:auto-resize=256,128,64,48,32,16 src-tauri/icons/icon.ico

# 生成 ICNS (macOS)
if command -v iconutil &> /dev/null; then
    echo "🍎 生成 macOS ICNS..."
    mkdir -p icon.iconset
    magick public/logo.svg -resize 16x16 icon.iconset/icon_16x16.png
    magick public/logo.svg -resize 32x32 icon.iconset/icon_16x16@2x.png
    magick public/logo.svg -resize 32x32 icon.iconset/icon_32x32.png
    magick public/logo.svg -resize 64x64 icon.iconset/icon_32x32@2x.png
    magick public/logo.svg -resize 128x128 icon.iconset/icon_128x128.png
    magick public/logo.svg -resize 256x256 icon.iconset/icon_128x128@2x.png
    magick public/logo.svg -resize 256x256 icon.iconset/icon_256x256.png
    magick public/logo.svg -resize 512x512 icon.iconset/icon_256x256@2x.png
    magick public/logo.svg -resize 512x512 icon.iconset/icon_512x512.png
    magick public/logo.svg -resize 1024x1024 icon.iconset/icon_512x512@2x.png
    iconutil -c icns icon.iconset -o src-tauri/icons/icon.icns
    rm -rf icon.iconset
else
    echo "⚠️  iconutil 未安装，跳过 ICNS 生成"
    echo "   在 macOS 上运行此脚本以生成 .icns 文件"
fi

echo "✅ 图标生成完成！"
echo ""
echo "生成的文件："
ls -lh src-tauri/icons/
```

### 使用脚本

```bash
# 赋予执行权限
chmod +x scripts/generate-icons.sh

# 运行
./scripts/generate-icons.sh
```

## ✅ 验证

生成后检查文件：

```bash
ls -lh src-tauri/icons/
```

应该看到：
```
32x32.png
128x128.png
128x128@2x.png
icon.icns
icon.ico
```

## 🚀 构建应用

图标生成后，正常构建即可：

```bash
pnpm tauri build
```

Tauri 会自动使用这些图标文件。

## 💡 故障排查

### ImageMagick 未安装

```bash
# 检查是否安装
magick -version
```

### SVG 渲染问题

如果 SVG 渲染效果不佳，可以：
1. 先导出为高分辨率 PNG
2. 再从 PNG 生成其他尺寸

### ICNS 生成失败

使用在线工具：
- https://cloudconvert.com/png-to-icns
- 上传 1024x1024 PNG
- 下载 .icns 文件

## 📚 参考资源

- [Tauri Icon 文档](https://tauri.app/v1/guides/features/icons)
- [ImageMagick 文档](https://imagemagick.org/)
- [macOS iconutil](https://developer.apple.com/library/archive/documentation/GraphicsAnimation/Conceptual/HighResolutionOSX/Optimizing/Optimizing.html)
