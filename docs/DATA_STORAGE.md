# Creative Studio Desktop - 数据存储文档

本文档详细说明了 Creative Studio Desktop 应用的数据存储架构、文件位置、权限配置和使用方式。

---

## 📂 存储架构概览

### 1. 存储位置

Creative Studio 使用操作系统标准的应用数据目录存储所有用户数据：

#### Windows
```
%APPDATA%\com.creativestudio.desktop\
C:\Users\<用户名>\AppData\Roaming\com.creativestudio.desktop\
```

#### macOS
```
~/Library/Application Support/com.creativestudio.desktop/
```

#### Linux
```
~/.local/share/com.creativestudio.desktop/
```

### 2. 目录结构

```
com.creativestudio.desktop/
├── creative-studio.db          # SQLite 数据库（作品、章节、角色等数据）
├── config.json                 # 用户配置文件
├── backups/                    # 数据库备份目录（可选）
│   ├── creative-studio-2026-01-06-001.db
│   └── creative-studio-2026-01-05-001.db
└── assets/                     # 资源文件目录
    ├── images/                 # 图片资源
    │   ├── <work_id>/
    │   │   ├── <file_id>.jpg
    │   │   └── <file_id>.png
    ├── videos/                 # 视频资源
    │   └── <work_id>/
    │       └── <file_id>.mp4
    ├── audio/                  # 音频资源
    │   └── <work_id>/
    │       └── <file_id>.mp3
    └── documents/              # 文档资源
        └── <work_id>/
            └── <file_id>.pdf
```

---

## 🗄️ 数据库设计

### 数据库文件

- **文件名**: `creative-studio.db`
- **引擎**: SQLite 3
- **路径**: 使用 Tauri SQL Plugin 的 `sqlite:creative-studio.db` 格式
- **当前版本**: v3

### 表结构

#### 核心表

| 表名 | 用途 | 记录数量级 |
|-----|------|----------|
| `db_version` | 数据库版本管理 | 1 条 |
| `works` | 作品信息 | 数百条 |
| `chapters` | 章节内容 | 数千条 |
| `characters` | 角色信息 | 数百条 |

#### 规划表（Planner 视图）

| 表名 | 用途 |
|-----|------|
| `outline_nodes` | 大纲节点（幕、场景、事件） |
| `scenes` | 场景管理 |
| `milestones` | 里程碑 |
| `clues` | 伏笔线索 |
| `conflicts` | 冲突点 |

#### 制作表（Director 视图）

| 表名 | 用途 |
|-----|------|
| `storyboards` | 分镜脚本 |
| `assets` | 素材文件元数据 |

### 数据库特性

#### 1. UUID 主键
所有表使用 UUID 作为主键，避免云同步时的 ID 冲突：
```sql
id TEXT PRIMARY KEY NOT NULL  -- 格式: "550e8400-e29b-41d4-a716-446655440000"
```

#### 2. 时间戳追踪
每条记录都有三个时间戳字段：
```typescript
{
  created_at: string;   // 创建时间 (ISO 8601)
  updated_at: string;   // 最后更新时间
  synced_at: string | null;  // 最后同步时间（为云同步预留）
}
```

#### 3. 软删除
使用 `deleted` 字段标记删除状态，不物理删除数据：
```sql
deleted INTEGER NOT NULL DEFAULT 0  -- 0=未删除, 1=已删除
```

#### 4. 乐观锁（v4）
使用 `version` 字段实现并发控制：
```typescript
version: number;  // 每次更新递增
```

#### 5. 外键约束
所有子表都有外键约束，支持级联删除：
```sql
FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE CASCADE
```

### 版本迁移历史

| 版本 | 更新内容 |
|-----|---------|
| v1 | 创建基础表：works, chapters, characters |
| v2 | 添加规划和制作表：outline_nodes, scenes, milestones, clues, conflicts, storyboards, assets |
| v3 | 修复 outline_nodes 的 parent_id 外键约束 |
| v4 | 添加 version 字段实现乐观锁（待应用） |

---

## ⚙️ 配置文件 (config.json)

### 文件位置
`%APPDATA%\com.creativestudio.desktop\config.json`

### 配置结构

```typescript
interface AppConfig {
  version: string;              // 应用版本
  theme: 'light' | 'dark' | 'auto';  // UI 主题

  editor: {
    fontSize: number;           // 字体大小 (px)
    fontFamily: string;         // 字体族
    lineHeight: number;         // 行高
    autoSaveInterval: number;   // 自动保存间隔（秒）
    spellCheck: boolean;        // 拼写检查
  };

  export: {
    defaultFormat: string;      // 默认导出格式
    pdfMargins: {              // PDF 页边距 (mm)
      top: number;
      bottom: number;
      left: number;
      right: number;
    };
    includeMetadata: boolean;   // 包含作者信息
  };

  window: {
    rememberSize: boolean;      // 记住窗口大小
    lastPosition?: { x: number; y: number };
    lastSize?: { width: number; height: number };
    maximized: boolean;
  };

  backup: {
    enabled: boolean;           // 启用自动备份
    interval: number;           // 备份间隔（小时）
    keepCount: number;          // 保留备份数量
  };

  lastOpenedWorkId?: string;   // 上次打开的作品ID
  isFirstLaunch: boolean;      // 首次启动标记
}
```

### 默认配置

```json
{
  "version": "0.1.0",
  "theme": "auto",
  "editor": {
    "fontSize": 16,
    "fontFamily": "'Segoe UI', 'Microsoft YaHei', sans-serif",
    "lineHeight": 1.8,
    "autoSaveInterval": 30,
    "spellCheck": true
  },
  "export": {
    "defaultFormat": "pdf",
    "pdfMargins": {
      "top": 25,
      "bottom": 25,
      "left": 25,
      "right": 25
    },
    "includeMetadata": true
  },
  "window": {
    "rememberSize": true,
    "maximized": false
  },
  "backup": {
    "enabled": true,
    "interval": 24,
    "keepCount": 7
  },
  "isFirstLaunch": true
}
```

### 使用配置服务

```typescript
import { loadConfig, saveConfig, updateConfig } from '@/services/configService';

// 加载配置
const config = await loadConfig();

// 更新部分配置
await updateConfig({
  theme: 'dark',
  editor: {
    fontSize: 18
  }
});

// 保存完整配置
await saveConfig(config);
```

---

## 📁 资源文件管理

### 支持的文件类型

#### 图片 (images/)
- `.jpg`, `.jpeg`, `.png`, `.gif`, `.bmp`, `.webp`, `.svg`

#### 视频 (videos/)
- `.mp4`, `.avi`, `.mov`, `.wmv`, `.flv`, `.mkv`, `.webm`

#### 音频 (audio/)
- `.mp3`, `.wav`, `.ogg`, `.m4a`, `.flac`, `.aac`

#### 文档 (documents/)
- `.pdf`, `.doc`, `.docx`, `.txt`, `.md`, `.rtf`

### 资源存储规则

1. **按作品分组**: 每个作品的资源存储在独立目录中
2. **UUID 文件名**: 使用 UUID 作为文件名，避免冲突
3. **保留扩展名**: 文件保留原始扩展名，便于识别类型
4. **元数据分离**: 文件元数据（名称、标签等）存储在数据库中

### 使用文件存储服务

```typescript
import {
  importAsset,
  importAssetWithDialog,
  exportAsset,
  removeAsset,
  getWorkStorageStats
} from '@/services/fileStorageService';

// 方式1: 直接导入文件
const asset = await importAsset(
  workId,
  'D:\\Pictures\\cover.jpg',
  '封面图片',
  ['封面', '重要']
);

// 方式2: 通过对话框选择文件
const asset = await importAssetWithDialog(workId, 'image');

// 导出资源
await exportAsset(asset, 'D:\\Export\\cover.jpg');

// 删除资源（删除文件和数据库记录）
await removeAsset(asset);

// 获取存储统计
const stats = await getWorkStorageStats(workId);
console.log(stats);
// {
//   image: { count: 5, size: 2048000 },
//   video: { count: 2, size: 50000000 },
//   audio: { count: 0, size: 0 },
//   document: { count: 1, size: 1024000 }
// }
```

---

## 🔐 权限配置

### Tauri Capabilities

配置文件：`src-tauri/capabilities/default.json`

#### 已配置权限

##### SQL 权限
```json
[
  "sql:default",
  "sql:allow-load",
  "sql:allow-execute",
  "sql:allow-select",
  "sql:allow-close"
]
```

##### 文件系统权限
```json
[
  "fs:allow-read",
  "fs:allow-write",
  "fs:allow-exists",
  "fs:allow-create",
  "fs:allow-remove",
  "fs:allow-mkdir",
  "fs:scope-appdata",
  "fs:scope-appdata-recursive",
  "fs:scope-document",
  "fs:scope-download",
  "fs:scope-desktop",
  "fs:scope-temp"
]
```

##### Dialog 权限
```json
[
  "dialog:allow-open",
  "dialog:allow-save",
  "dialog:allow-message",
  "dialog:allow-ask",
  "dialog:allow-confirm"
]
```

##### 路径访问权限
```json
[
  "core:path:allow-app-data-dir",
  "core:path:allow-app-config-dir",
  "core:path:allow-document-dir",
  "core:path:allow-download-dir",
  "core:path:allow-desktop-dir"
]
```

### 安全特性

1. **沙箱隔离**: 只能访问明确授权的目录
2. **作用域限制**: 文件系统操作限制在特定作用域内
3. **用户确认**: 文件选择需要通过系统对话框
4. **最小权限原则**: 只请求必需的权限

---

## 💾 数据备份与恢复

### 自动备份（计划实现）

```typescript
// 在 configService 中配置
backup: {
  enabled: true,        // 启用自动备份
  interval: 24,         // 每24小时备份一次
  keepCount: 7          // 保留最近7个备份
}
```

### 手动备份

```typescript
import { appDataDir } from '@tauri-apps/api/path';
import { copyFile } from '@tauri-apps/plugin-fs';

async function backupDatabase() {
  const appData = await appDataDir();
  const dbPath = `${appData}creative-studio.db`;
  const timestamp = new Date().toISOString().replace(/:/g, '-');
  const backupPath = `${appData}backups/creative-studio-${timestamp}.db`;

  await copyFile(dbPath, backupPath);
  console.log('备份完成:', backupPath);
}
```

### 恢复数据

1. 关闭应用
2. 将备份文件重命名为 `creative-studio.db`
3. 替换原数据库文件
4. 重启应用

---

## 🛠️ 开发指南

### 访问数据库

```typescript
import { getDatabase } from '@/services/database';

const db = await getDatabase();

// 查询
const works = await db.select('SELECT * FROM works WHERE deleted = 0');

// 执行
await db.execute('INSERT INTO works (id, title, type) VALUES (?, ?, ?)', [
  id, title, type
]);

// 事务
import { transaction } from '@/services/database';
await transaction(async (db) => {
  await db.execute('...');
  await db.execute('...');
});
```

### 使用服务层

推荐使用封装好的服务层而不是直接操作数据库：

```typescript
// ✅ 推荐
import { createWork, getWorks } from '@/services/workService';
const work = await createWork('新作品', 'script');

// ❌ 不推荐
const db = await getDatabase();
await db.execute('INSERT INTO works ...');
```

### 添加新表

1. 在 `database.ts` 中增加版本号
2. 创建新的迁移函数 `migrateToVX()`
3. 在 `migrateDatabase()` 的 switch 中添加 case
4. 在 `src/types/storage.ts` 中添加类型定义
5. 创建对应的服务文件（如 `xxxService.ts`）

---

## 📊 性能优化建议

### 1. 数据库优化

- ✅ 已创建索引（work_id, type, created_at 等）
- ✅ 使用软删除减少数据重组
- ✅ 使用事务批量操作
- 建议：定期执行 `VACUUM` 清理碎片

### 2. 资源文件优化

- 建议：限制单个文件大小（如 50MB）
- 建议：压缩图片和视频
- 建议：清理未使用的资源文件

### 3. 配置文件优化

- ✅ 使用 JSON 格式，易于读写
- ✅ 延迟加载，按需访问
- 建议：添加配置缓存

---

## 🔍 故障排查

### 数据库损坏

```bash
# 检查数据库完整性
sqlite3 creative-studio.db "PRAGMA integrity_check;"

# 修复数据库
sqlite3 creative-studio.db "PRAGMA wal_checkpoint(TRUNCATE);"
```

### 找不到数据库文件

1. 检查应用数据目录权限
2. 查看日志中的数据库路径
3. 确认 Tauri 权限配置正确

### 资源文件丢失

1. 检查 `assets/` 目录是否存在
2. 验证数据库中的 `file_path` 是否正确
3. 检查文件系统权限

---

## 📝 更新日志

### 2026-01-06
- ✅ 添加完整的权限配置（SQL、FS、Dialog）
- ✅ 创建配置文件管理服务
- ✅ 创建文件存储管理服务
- ✅ 完善数据存储文档

### 历史版本
- v3: 修复 outline_nodes 外键约束
- v2: 添加规划和制作表
- v1: 创建基础表结构

---

## 📚 相关资源

- [Tauri SQL Plugin 文档](https://v2.tauri.app/plugin/sql/)
- [Tauri FS Plugin 文档](https://v2.tauri.app/plugin/fs/)
- [SQLite 官方文档](https://www.sqlite.org/docs.html)

---

**维护者**: Creative Studio 开发团队
**最后更新**: 2026-01-06
