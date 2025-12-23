# Loci AI 引擎集成指南

本文档说明如何在 Creative Studio Desktop 中使用预编译的 Loci AI 引擎。

## 🎯 架构设计

```
Loci (公开仓库)
  └─ GitHub Actions 自动编译
  └─ Release 发布预编译 DLL

Creative Studio (私有仓库)
  └─ 下载并使用预编译 DLL
  └─ 节省 CI/CD 时间
```

---

## 📦 方案 1：开发模式（使用 path 依赖）

### 适用场景
- 本地开发
- 需要修改 Loci 代码
- 快速迭代测试

### 配置
```toml
# src-tauri/Cargo.toml
[dependencies]
loci = { path = "../../Loci" }
```

### 编译
```bash
cd D:\OpenProject\Creative-Studio-desktop
npm run tauri:dev
```

**优点**:
- ✅ 代码改动立即生效
- ✅ 便于调试

**缺点**:
- ❌ 每次编译都要重新编译 Loci（5-10分钟）
- ❌ 需要 Loci 源码
- ❌ 需要本地安装 LLVM/Clang

---

## 🚀 方案 2：生产模式（使用预编译 DLL）

### 适用场景
- 生产构建
- GitHub Actions CI/CD
- 快速编译
- 不需要修改 Loci

### 步骤

#### 1. 从 Loci Release 下载预编译库

访问: https://github.com/你的用户名/loci/releases/latest

下载对应平台的文件：
- Windows (MinGW): `loci-windows-gnu.zip`
- Windows (MSVC): `loci-windows-msvc.zip`
- Linux: `loci-linux.tar.gz`
- macOS: `loci-macos.tar.gz`

#### 2. 解压并放置文件

```bash
# 解压
unzip loci-windows-gnu.zip -d loci-prebuilt

# 目录结构
loci-prebuilt/
  ├── loci.dll       # 动态链接库
  ├── libloci.a      # 静态库（可选）
  └── loci.h         # C 头文件（可选）
```

#### 3. 修改 Cargo.toml

**方案 A: 使用 Git 依赖（推荐）**
```toml
# src-tauri/Cargo.toml
[dependencies]
# 使用 Loci 特定版本
loci = { git = "https://github.com/你的用户名/loci", tag = "v0.1.0" }
```

**方案 B: 使用 crates.io（发布后）**
```toml
[dependencies]
loci = "0.1.0"
```

**方案 C: 完全独立（高级）**

如果你想完全控制 DLL 版本：

```toml
# 注释掉 loci 依赖
# loci = { ... }
```

然后在构建脚本中复制 DLL：

```rust
// src-tauri/build.rs
fn main() {
    // 复制预编译的 DLL
    let dll_source = "../../loci-prebuilt/loci.dll";
    let dll_dest = "target/release/loci.dll";
    std::fs::copy(dll_source, dll_dest).expect("Failed to copy loci.dll");

    println!("cargo:rerun-if-changed={}", dll_source);
}
```

#### 4. 构建应用

```bash
npm run tauri:build
```

**编译时间对比**:
- 使用 path 依赖: ~15-20 分钟
- 使用预编译 DLL: ~3-5 分钟

---

## 🤖 方案 3：GitHub Actions 自动化（推荐）

### 配置 Creative Studio 的 GitHub Actions

创建 `.github/workflows/build.yml`:

```yaml
name: Build Creative Studio

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  build:
    runs-on: windows-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Download Loci prebuilt
        run: |
          # 下载最新的 Loci Release
          gh release download v0.1.0 \
            --repo 你的用户名/loci \
            --pattern "loci-windows-gnu.zip"

          # 解压
          unzip loci-windows-gnu.zip -d loci-prebuilt
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Setup Rust
        uses: actions-rust-lang/setup-rust-toolchain@v1
        with:
          toolchain: stable-x86_64-pc-windows-gnu

      - name: Install dependencies
        run: npm install

      - name: Build application
        run: npm run tauri:build
        env:
          # 告诉 Cargo 使用 Git 依赖而非 path
          CARGO_NET_GIT_FETCH_WITH_CLI: true

      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: creative-studio-windows
          path: src-tauri/target/release/bundle/
```

### 优势
- ✅ 自动下载最新 Loci
- ✅ 无需在仓库中存储大型 DLL
- ✅ 快速编译（3-5 分钟）
- ✅ 节省私有仓库 Actions 时间

---

## 🔄 版本管理策略

### Loci 版本号规范

遵循语义化版本（Semantic Versioning）：

- `v0.1.0` - 初始版本
- `v0.1.1` - Bug 修复
- `v0.2.0` - 新功能（向后兼容）
- `v1.0.0` - 稳定版本

### Creative Studio 锁定版本

在 `Cargo.toml` 中指定具体版本：

```toml
# 锁定到特定版本（稳定）
loci = { git = "https://github.com/你的用户名/loci", tag = "v0.1.0" }

# 使用最新版本（开发）
loci = { git = "https://github.com/你的用户名/loci", branch = "main" }
```

### 更新 Loci

```bash
# 1. 检查 Loci 新版本
# 访问: https://github.com/你的用户名/loci/releases

# 2. 更新 Cargo.toml 中的版本号
# tag = "v0.1.0" -> tag = "v0.2.0"

# 3. 更新依赖
cargo update -p loci

# 4. 测试
npm run tauri:dev

# 5. 提交
git commit -am "Update Loci to v0.2.0"
```

---

## 📊 性能对比

| 模式 | 首次编译 | 增量编译 | CI/CD 时间 | 磁盘占用 |
|-----|---------|---------|-----------|---------|
| path 依赖 | 15-20分钟 | 1-2分钟 | 15-20分钟 | 大（需要 Loci 源码） |
| Git 依赖 | 10-15分钟 | 1-2分钟 | 10-15分钟 | 中（下载 Loci 源码） |
| 预编译 DLL | 3-5分钟 | 1-2分钟 | 3-5分钟 | 小（仅 DLL 文件） |

---

## 🛠️ 故障排除

### 问题 1: 找不到 loci.dll

**现象**:
```
error: could not find loci.dll
```

**解决**:
1. 检查 DLL 是否在正确路径
2. 检查工具链是否匹配（GNU vs MSVC）
3. 手动复制 DLL 到 `target/release/`

### 问题 2: DLL 版本不匹配

**现象**:
```
error: function signature mismatch
```

**解决**:
1. 确认 Loci 版本号
2. 清理构建缓存: `cargo clean`
3. 重新下载对应版本的 DLL

### 问题 3: GitHub Actions 下载失败

**现象**:
```
Error: Resource not accessible by integration
```

**解决**:
1. 检查 Release 是否存在
2. 确认 GITHUB_TOKEN 权限
3. 使用 `gh` CLI 工具

---

## 🔐 安全性考虑

### 验证 DLL 完整性

```bash
# 计算 SHA256 哈希
sha256sum loci.dll

# 与 Loci Release 页面公布的哈希值对比
```

### 在 GitHub Actions 中验证

```yaml
- name: Verify Loci integrity
  run: |
    echo "期望的哈希值  loci.dll" | sha256sum -c -
```

---

## 📝 推荐工作流

### 日常开发
```bash
# 使用 path 依赖，快速迭代
cd Creative-Studio-desktop
npm run tauri:dev
```

### 发布构建
```bash
# 1. 更新到最新稳定版 Loci
# 修改 Cargo.toml: tag = "v0.1.0"

# 2. 构建
npm run tauri:build

# 3. 测试
./src-tauri/target/release/creative-studio-desktop.exe

# 4. 提交并推送
git commit -am "Release v1.0.0"
git tag v1.0.0
git push --tags
```

### Loci 更新流程
```bash
# 1. Loci 仓库发布新版本
cd Loci
git tag v0.2.0
git push --tags
# GitHub Actions 自动编译和发布

# 2. Creative Studio 更新依赖
cd Creative-Studio-desktop
# 修改 Cargo.toml: tag = "v0.2.0"
cargo update -p loci
npm run tauri:dev  # 测试
git commit -am "Update Loci to v0.2.0"
```

---

## 📞 支持

- Loci 问题: https://github.com/你的用户名/loci/issues
- Creative Studio 问题: 内部 Issue Tracker

---

最后更新: 2025-12-22
