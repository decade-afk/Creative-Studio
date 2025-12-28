# AI 模型配置指南

## 📋 概述

Creative Studio 使用本地 AI 模型提供智能写作功能。本文档说明如何配置 AI 模型。

## 🎯 快速开始

### 方式一: 通过界面配置 (推荐)

1. 启动 Creative Studio
2. 首次启动会自动弹出 **AI 助手配置** 对话框
3. 点击 **浏览** 按钮,选择您的 GGUF 模型文件
4. 点击 **配置并启用 AI** 按钮
5. 等待模型加载完成

### 方式二: 手动配置默认路径

如果您有固定的模型位置,可以修改默认配置:

**编辑文件:** `src/types/ai.ts`

```typescript
export const DEFAULT_AI_CONFIG: AIConfig = {
  model_path: 'D:/models/your-model.gguf',  // ← 修改为您的模型路径
  context_size: 4096,
  gpu_layers: 0,      // 有 NVIDIA GPU 可设为 32-40
  threads: 4,         // 建议设为 CPU 核心数的一半
  temperature: 0.7,
  top_p: 0.9,
  top_k: 40,
  repeat_penalty: 1.1,
};
```

## 🤖 推荐模型

### 中文创作推荐

| 模型 | 大小 | 内存需求 | 下载地址 |
|------|------|----------|----------|
| Qwen2.5-7B-Instruct-Q4_K_M | ~4.4GB | 8GB+ | [HuggingFace](https://huggingface.co/Qwen/Qwen2.5-7B-Instruct-GGUF) |
| Qwen2.5-14B-Instruct-Q4_K_M | ~8.5GB | 16GB+ | [HuggingFace](https://huggingface.co/Qwen/Qwen2.5-14B-Instruct-GGUF) |
| GLM-4-9B-Chat-Q4_K_M | ~5.5GB | 10GB+ | [HuggingFace](https://huggingface.co/THUDM/glm-4-9b-chat-gguf) |

### 轻量级选择 (4GB 内存)

| 模型 | 大小 | 内存需求 | 下载地址 |
|------|------|----------|----------|
| Qwen2.5-3B-Instruct-Q4_K_M | ~2.0GB | 4GB+ | [HuggingFace](https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF) |
| Phi-3-mini-128k-Q4_K_M | ~2.4GB | 4GB+ | [HuggingFace](https://huggingface.co/microsoft/Phi-3-mini-128k-instruct-gguf) |

### 高性能选择 (16GB+ 内存)

| 模型 | 大小 | 内存需求 | 下载地址 |
|------|------|----------|----------|
| Qwen2.5-32B-Instruct-Q4_K_M | ~19GB | 32GB+ | [HuggingFace](https://huggingface.co/Qwen/Qwen2.5-32B-Instruct-GGUF) |
| Llama-3.1-70B-Q4_K_M | ~40GB | 64GB+ | [HuggingFace](https://huggingface.co/meta-llama/Llama-3.1-70B-Instruct-GGUF) |

## 📥 下载模型

### 使用 HuggingFace CLI

```bash
# 安装 huggingface-cli
pip install huggingface-hub

# 下载模型 (以 Qwen2.5-7B 为例)
huggingface-cli download \
  Qwen/Qwen2.5-7B-Instruct-GGUF \
  qwen2.5-7b-instruct-q4_k_m.gguf \
  --local-dir D:/models
```

### 使用浏览器下载

1. 访问模型页面 (例如 https://huggingface.co/Qwen/Qwen2.5-7B-Instruct-GGUF)
2. 点击 **Files and versions** 标签
3. 找到 `.gguf` 文件并点击下载
4. 保存到本地目录 (例如 `D:/models/`)

## ⚙️ 性能优化

### CPU 推理

```typescript
{
  gpu_layers: 0,           // 完全使用 CPU
  threads: 8,              // 设置为 CPU 物理核心数
  context_size: 4096,      // 较小的上下文
}
```

**性能**: ~5-15 tokens/秒 (取决于 CPU)

### GPU 加速 (NVIDIA)

```typescript
{
  gpu_layers: 35,          // 将大部分层放到 GPU
  threads: 4,              // 减少 CPU 线程数
  context_size: 8192,      // 可以使用更大的上下文
}
```

**性能**: ~50-150 tokens/秒 (取决于 GPU)

### Apple Silicon (M1/M2/M3)

```typescript
{
  gpu_layers: 40,          // Metal 加速
  threads: 4,
  context_size: 8192,
}
```

**性能**: ~30-80 tokens/秒 (取决于芯片型号)

## 🔧 常见问题

### Q: 模型加载失败

**A:** 检查以下几点:
1. 文件路径是否正确
2. 文件是否完整下载 (检查文件大小)
3. 是否为 GGUF 格式
4. 内存是否足够

### Q: 生成速度很慢

**A:** 优化建议:
1. 降低 `context_size` (例如 2048)
2. 使用更小的模型 (例如 3B 而不是 7B)
3. 如果有 GPU,增加 `gpu_layers`
4. 增加 `threads` (不超过 CPU 核心数)

### Q: 内存不足

**A:** 解决方案:
1. 使用量化程度更高的模型 (Q4_K_M → Q3_K_M → Q2_K)
2. 使用更小的模型 (7B → 3B → 1B)
3. 减小 `context_size`
4. 关闭其他占用内存的应用

### Q: 如何更换模型

**A:** 两种方式:
1. 通过界面: 设置 → AI 助手 → 选择新模型 → 加载
2. 修改代码: 更新 `DEFAULT_AI_CONFIG.model_path`

## 📝 配置示例

### 推荐配置 - 8GB 内存

```typescript
{
  model_path: 'D:/models/qwen2.5-7b-instruct-q4_k_m.gguf',
  context_size: 4096,
  gpu_layers: 0,
  threads: 4,
  temperature: 0.7,
  top_p: 0.9,
  top_k: 40,
  repeat_penalty: 1.1,
}
```

### 推荐配置 - 16GB 内存 + NVIDIA GPU

```typescript
{
  model_path: 'D:/models/qwen2.5-14b-instruct-q4_k_m.gguf',
  context_size: 8192,
  gpu_layers: 40,
  threads: 4,
  temperature: 0.7,
  top_p: 0.9,
  top_k: 40,
  repeat_penalty: 1.1,
}
```

### 推荐配置 - Apple M1/M2/M3 (16GB)

```typescript
{
  model_path: '/Users/you/models/qwen2.5-7b-instruct-q4_k_m.gguf',
  context_size: 8192,
  gpu_layers: 40,  // Metal 加速
  threads: 4,
  temperature: 0.7,
  top_p: 0.9,
  top_k: 40,
  repeat_penalty: 1.1,
}
```

## 🚀 高级配置

### 参数说明

| 参数 | 作用 | 推荐值 | 范围 |
|------|------|--------|------|
| `temperature` | 控制随机性,越高越有创意 | 0.7 | 0.0-2.0 |
| `top_p` | 核采样,限制候选词范围 | 0.9 | 0.0-1.0 |
| `top_k` | 限制每步候选词数量 | 40 | 1-100 |
| `repeat_penalty` | 防止重复,越高越不重复 | 1.1 | 1.0-2.0 |
| `context_size` | 上下文窗口大小 | 4096 | 512-32768 |
| `gpu_layers` | GPU 加速层数 | 0/35 | 0-80 |
| `threads` | CPU 线程数 | 4 | 1-32 |

### 不同创作场景的参数调整

**续写小说** (需要创意):
```typescript
{ temperature: 0.8, top_p: 0.95, repeat_penalty: 1.15 }
```

**润色文本** (需要准确):
```typescript
{ temperature: 0.5, top_p: 0.85, repeat_penalty: 1.05 }
```

**生成对话** (需要自然):
```typescript
{ temperature: 0.7, top_p: 0.9, repeat_penalty: 1.1 }
```

## 📚 更多资源

- [Loci 项目](https://github.com/your-repo/loci)
- [GGUF 格式说明](https://github.com/ggerganov/llama.cpp)
- [HuggingFace 模型库](https://huggingface.co/models?library=gguf)
- [Ollama 模型库](https://ollama.com/library)

## 🆘 获取帮助

如果遇到问题,可以:
1. 查看 [FAQ](./FAQ.md)
2. 提交 [Issue](https://github.com/your-repo/creative-studio/issues)
3. 加入社区讨论群

---

**提示**: 首次加载模型可能需要 10-60 秒,请耐心等待。加载成功后,后续启动会更快。
