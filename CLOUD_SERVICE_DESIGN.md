# Creative Studio - 云端服务架构设计

**设计日期**: 2025-12-28
**版本**: v1.0
**技术栈**: Go + PostgreSQL + Redis + MinIO
**状态**: 📋 设计阶段

---

## 📋 目录

1. [架构概览](#架构概览)
2. [技术选型](#技术选型)
3. [数据库设计](#数据库设计)
4. [API 设计](#api-设计)
5. [同步策略](#同步策略)
6. [安全方案](#安全方案)
7. [部署方案](#部署方案)

---

## 🏗️ 架构概览

### 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Creative Studio 桌面客户端                  │
│  ┌──────────┬──────────┬──────────┬──────────┬──────────┐   │
│  │ 创作视图  │ 规划视图  │ 导演视图  │ AI助手   │ 设置面板  │   │
│  └──────────┴──────────┴──────────┴──────────┴──────────┘   │
│                            ↕ HTTP/WebSocket                  │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                       Nginx 反向代理                          │
│                    (SSL/TLS + 负载均衡)                        │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    Go 云端服务 (RESTful API)                  │
│  ┌────────────────────────────────────────────────────┐     │
│  │  Gin Web Framework                                  │     │
│  │  ┌──────────┬──────────┬──────────┬─────────────┐ │     │
│  │  │ 用户认证  │ 作品同步  │ 文件存储  │ WebSocket   │ │     │
│  │  └──────────┴──────────┴──────────┴─────────────┘ │     │
│  └────────────────────────────────────────────────────┘     │
│                     ↓          ↓          ↓                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                  │
│  │PostgreSQL│  │  Redis   │  │  MinIO   │                  │
│  │ (主数据库)│  │ (缓存层)  │  │(对象存储)│                  │
│  └──────────┘  └──────────┘  └──────────┘                  │
└─────────────────────────────────────────────────────────────┘
```

### 核心功能模块

1. **用户管理**
   - 注册/登录 (JWT认证)
   - 用户资料管理
   - 多设备管理

2. **数据同步**
   - 增量同步 (基于时间戳)
   - 冲突解决 (最后写入优先 + 版本号)
   - 离线优先 (本地SQLite → 云端PostgreSQL)

3. **文件存储**
   - 头像上传 (MinIO)
   - 素材管理 (图片/视频/音频)
   - CDN 加速

4. **实时协作** (可选 - v2.0)
   - WebSocket 通信
   - 多人编辑
   - 实时通知

---

## 🔧 技术选型

### 后端框架

**选择**: Go + Gin Web Framework

**理由**:
- ✅ 高性能并发 (goroutine)
- ✅ 编译型语言,部署简单
- ✅ 内存占用低
- ✅ 丰富的标准库
- ✅ 优秀的 HTTP 框架 (Gin)

**替代方案**:
- Node.js + Express (性能较低)
- Rust + Actix-web (学习曲线陡峭)
- Java + Spring Boot (资源占用高)

### 数据库

**主数据库**: PostgreSQL 14+

**理由**:
- ✅ 强大的 JSON 支持 (适合灵活数据)
- ✅ 完整的事务支持 (ACID)
- ✅ 丰富的索引类型 (GIN, GiST)
- ✅ 成熟的复制和高可用方案
- ✅ 与 SQLite 语法相似 (便于迁移)

**缓存层**: Redis 7+

**理由**:
- ✅ Session 存储
- ✅ 同步队列
- ✅ 限流控制
- ✅ 发布/订阅 (实时通知)

### 对象存储

**选择**: MinIO (自建) 或 AWS S3

**理由**:
- ✅ S3 API 兼容
- ✅ 支持分布式部署
- ✅ 开源免费 (MinIO)
- ✅ 性能优秀

### 认证方案

**JWT (JSON Web Token)**

```go
// Token 结构
{
  "user_id": "uuid",
  "username": "username",
  "exp": 1704067200,  // 过期时间
  "iat": 1704063600   // 签发时间
}
```

### 依赖库

```go
require (
    github.com/gin-gonic/gin v1.10.0          // Web框架
    github.com/golang-jwt/jwt/v5 v5.2.0       // JWT认证
    gorm.io/gorm v1.25.5                      // ORM
    gorm.io/driver/postgres v1.5.4            // PostgreSQL驱动
    github.com/go-redis/redis/v8 v8.11.5      // Redis客户端
    github.com/minio/minio-go/v7 v7.0.66      // MinIO SDK
    github.com/google/uuid v1.5.0             // UUID生成
    golang.org/x/crypto/bcrypt                // 密码加密
    github.com/gorilla/websocket v1.5.1       // WebSocket
)
```

---

## 🗄️ 数据库设计

### 用户表 (users)

```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    avatar_url VARCHAR(500),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    last_login_at TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);
```

### 设备表 (devices)

```sql
CREATE TABLE devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_name VARCHAR(100) NOT NULL,
    device_type VARCHAR(50),  -- 'windows', 'macos', 'linux'
    last_sync_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_devices_user_id ON devices(user_id);
```

### 作品表 (works)

```sql
CREATE TABLE works (
    id UUID PRIMARY KEY,  -- 来自客户端
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL,  -- 'script' | 'novel' | 'short_drama'
    cover_image VARCHAR(500),
    description TEXT,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    synced_at TIMESTAMP DEFAULT NOW(),
    deleted BOOLEAN DEFAULT FALSE,
    version INTEGER DEFAULT 1
);

CREATE INDEX idx_works_user_id ON works(user_id);
CREATE INDEX idx_works_updated_at ON works(updated_at);
```

### 章节表 (chapters)

```sql
CREATE TABLE chapters (
    id UUID PRIMARY KEY,
    work_id UUID NOT NULL REFERENCES works(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    content TEXT,
    order_num INTEGER,
    word_count INTEGER DEFAULT 0,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    synced_at TIMESTAMP DEFAULT NOW(),
    deleted BOOLEAN DEFAULT FALSE,
    version INTEGER DEFAULT 1
);

CREATE INDEX idx_chapters_work_id ON chapters(work_id);
CREATE INDEX idx_chapters_user_id ON chapters(user_id);
CREATE INDEX idx_chapters_updated_at ON chapters(updated_at);
```

### 同步日志表 (sync_logs)

```sql
CREATE TABLE sync_logs (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id UUID REFERENCES devices(id),
    sync_type VARCHAR(50),  -- 'full' | 'incremental'
    synced_records INTEGER,
    conflicts INTEGER DEFAULT 0,
    sync_started_at TIMESTAMP,
    sync_completed_at TIMESTAMP,
    status VARCHAR(50)  -- 'success' | 'failed' | 'partial'
);

CREATE INDEX idx_sync_logs_user_id ON sync_logs(user_id);
```

### 其他数据表

参考桌面端 SQLite schema,创建云端版本:
- `characters` (角色)
- `scenes` (场景)
- `outline_nodes` (大纲)
- `milestones` (里程碑)
- `clues` (伏笔)
- `conflicts` (冲突)
- `storyboards` (分镜)
- `assets` (素材 - 仅存储元数据,文件存MinIO)
- `world_settings` (世界观设定)

---

## 🔌 API 设计

### 认证 API

#### 1. 用户注册

```http
POST /api/v1/auth/register
Content-Type: application/json

{
  "username": "creator123",
  "email": "creator@example.com",
  "password": "securePassword123"
}

Response 201:
{
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "username": "creator123",
  "token": "eyJhbGciOiJIUzI1NiIs..."
}
```

#### 2. 用户登录

```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "creator@example.com",
  "password": "securePassword123"
}

Response 200:
{
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "username": "creator123",
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "expires_at": "2025-01-28T12:00:00Z"
}
```

#### 3. Token 刷新

```http
POST /api/v1/auth/refresh
Authorization: Bearer <old_token>

Response 200:
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "expires_at": "2025-01-28T12:00:00Z"
}
```

---

### 同步 API

#### 1. 获取服务器最新数据

```http
GET /api/v1/sync/pull?since=2025-12-28T10:00:00Z
Authorization: Bearer <token>

Response 200:
{
  "works": [
    {
      "id": "uuid",
      "title": "我的剧本",
      "updated_at": "2025-12-28T11:30:00Z",
      "version": 5,
      "deleted": false
    }
  ],
  "chapters": [...],
  "characters": [...],
  "sync_token": "2025-12-28T12:00:00Z"
}
```

#### 2. 推送本地更改

```http
POST /api/v1/sync/push
Authorization: Bearer <token>
Content-Type: application/json

{
  "device_id": "device-uuid",
  "works": [
    {
      "id": "uuid",
      "title": "我的剧本",
      "updated_at": "2025-12-28T11:30:00Z",
      "version": 5
    }
  ],
  "chapters": [...],
  "characters": [...]
}

Response 200:
{
  "synced": 25,
  "conflicts": [
    {
      "type": "work",
      "id": "uuid",
      "server_version": 6,
      "client_version": 5,
      "resolution": "server_wins"
    }
  ]
}
```

#### 3. 冲突解决策略

```go
// 冲突解决规则
type ConflictResolution string

const (
    ServerWins    ConflictResolution = "server_wins"    // 服务器优先
    ClientWins    ConflictResolution = "client_wins"    // 客户端优先
    LatestWins    ConflictResolution = "latest_wins"    // 最新修改优先
    ManualResolve ConflictResolution = "manual_resolve" // 需要用户手动解决
)

// 默认策略: 最新修改优先
func resolveConflict(server, client Entity) Entity {
    if client.UpdatedAt.After(server.UpdatedAt) {
        return client
    }
    return server
}
```

---

### 作品管理 API

#### 1. 获取作品列表

```http
GET /api/v1/works?page=1&limit=20&sort=updated_at
Authorization: Bearer <token>

Response 200:
{
  "works": [...],
  "total": 50,
  "page": 1,
  "limit": 20
}
```

#### 2. 创建作品

```http
POST /api/v1/works
Authorization: Bearer <token>
Content-Type: application/json

{
  "id": "client-generated-uuid",
  "title": "新剧本",
  "type": "script"
}

Response 201:
{
  "id": "uuid",
  "title": "新剧本",
  "created_at": "2025-12-28T12:00:00Z"
}
```

#### 3. 更新作品

```http
PUT /api/v1/works/{work_id}
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "新标题",
  "version": 5
}

Response 200:
{
  "id": "uuid",
  "title": "新标题",
  "version": 6,
  "updated_at": "2025-12-28T12:05:00Z"
}
```

#### 4. 删除作品 (软删除)

```http
DELETE /api/v1/works/{work_id}
Authorization: Bearer <token>

Response 204 No Content
```

---

### 文件上传 API

#### 1. 上传头像

```http
POST /api/v1/upload/avatar
Authorization: Bearer <token>
Content-Type: multipart/form-data

file: <binary data>

Response 200:
{
  "url": "https://cdn.example.com/avatars/user-uuid.jpg",
  "size": 102400,
  "mime_type": "image/jpeg"
}
```

#### 2. 上传素材

```http
POST /api/v1/upload/asset
Authorization: Bearer <token>
Content-Type: multipart/form-data

work_id: "uuid"
file: <binary data>
type: "image"

Response 200:
{
  "asset_id": "uuid",
  "url": "https://cdn.example.com/assets/xxx.jpg",
  "thumbnail_url": "https://cdn.example.com/assets/xxx_thumb.jpg"
}
```

---

### WebSocket API (实时通知)

```
ws://api.example.com/api/v1/ws?token=<jwt_token>

// 客户端 → 服务器
{
  "type": "subscribe",
  "channel": "work:uuid"
}

// 服务器 → 客户端
{
  "type": "work_updated",
  "work_id": "uuid",
  "updated_by": "other_device",
  "timestamp": "2025-12-28T12:00:00Z"
}
```

---

## 🔄 同步策略

### 增量同步流程

```go
// 1. 客户端发送最后同步时间戳
lastSyncTime := "2025-12-28T10:00:00Z"

// 2. 服务器查询在此之后修改的所有记录
SELECT * FROM works
WHERE user_id = ?
  AND updated_at > ?
ORDER BY updated_at ASC

// 3. 客户端合并数据
for each serverRecord {
    localRecord := findLocalRecord(serverRecord.ID)

    if localRecord == nil {
        // 服务器有新记录 → 插入本地
        insertLocal(serverRecord)
    } else if serverRecord.UpdatedAt > localRecord.UpdatedAt {
        // 服务器更新 → 覆盖本地
        updateLocal(serverRecord)
    } else if localRecord.UpdatedAt > serverRecord.UpdatedAt {
        // 本地更新 → 推送到服务器
        pushToServer(localRecord)
    }
}

// 4. 更新同步时间戳
localStorage.setItem('last_sync_time', currentTime)
```

### 冲突解决

**场景**: 同一条记录在客户端和服务器都被修改

**策略**:
1. **时间戳比较**: 最新修改优先
2. **版本号**: 使用乐观锁 (version字段)
3. **手动解决**: 如果差异过大,提示用户选择

```go
// 示例: 版本号冲突检测
func updateWork(w *Work) error {
    result := db.Model(&Work{}).
        Where("id = ? AND version = ?", w.ID, w.Version).
        Updates(map[string]interface{}{
            "title":      w.Title,
            "updated_at": time.Now(),
            "version":    w.Version + 1,
        })

    if result.RowsAffected == 0 {
        return ErrConflict  // 版本号不匹配,发生冲突
    }
    return nil
}
```

---

## 🔒 安全方案

### 1. 认证安全

```go
// JWT 配置
const (
    TokenExpiration = 7 * 24 * time.Hour  // 7天过期
    RefreshWindow   = 24 * time.Hour      // 刷新窗口
)

// 密码加密 (bcrypt)
hashedPassword, _ := bcrypt.GenerateFromPassword(
    []byte(password),
    bcrypt.DefaultCost,
)
```

### 2. API 限流

```go
// 使用 Redis 实现令牌桶算法
// 每个用户每分钟最多 60 次请求
middleware.RateLimiter(redis, 60, time.Minute)
```

### 3. 数据加密

- **传输加密**: HTTPS/TLS 1.3
- **存储加密**: PostgreSQL 字段级加密 (敏感数据)
- **密码存储**: bcrypt + salt

### 4. SQL 注入防护

```go
// 使用参数化查询 (GORM 自动处理)
db.Where("email = ?", email).First(&user)  // ✅ 安全

// 避免字符串拼接
query := fmt.Sprintf("SELECT * FROM users WHERE email = '%s'", email)  // ❌ 危险
```

---

## 🚀 部署方案

### Docker Compose 部署

```yaml
version: '3.8'

services:
  # Go 后端服务
  api:
    build: ./backend
    ports:
      - "8080:8080"
    environment:
      - DATABASE_URL=postgresql://user:pass@postgres:5432/creative_studio
      - REDIS_URL=redis://redis:6379
      - MINIO_ENDPOINT=minio:9000
      - JWT_SECRET=${JWT_SECRET}
    depends_on:
      - postgres
      - redis
      - minio

  # PostgreSQL 数据库
  postgres:
    image: postgres:14-alpine
    volumes:
      - postgres_data:/var/lib/postgresql/data
    environment:
      - POSTGRES_USER=creative_user
      - POSTGRES_PASSWORD=secure_password
      - POSTGRES_DB=creative_studio

  # Redis 缓存
  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data

  # MinIO 对象存储
  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    ports:
      - "9000:9000"
      - "9001:9001"
    volumes:
      - minio_data:/data
    environment:
      - MINIO_ROOT_USER=admin
      - MINIO_ROOT_PASSWORD=secure_password

  # Nginx 反向代理
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl
    depends_on:
      - api

volumes:
  postgres_data:
  redis_data:
  minio_data:
```

### 环境变量

```bash
# .env
JWT_SECRET=your-super-secret-jwt-key-change-in-production
DATABASE_URL=postgresql://creative_user:secure_password@localhost:5432/creative_studio
REDIS_URL=redis://localhost:6379
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=admin
MINIO_SECRET_KEY=secure_password
SERVER_PORT=8080
```

---

## 📦 项目目录结构

```
creative-studio-cloud/
├── cmd/
│   └── server/
│       └── main.go              # 入口文件
├── internal/
│   ├── api/
│   │   ├── auth.go              # 认证API
│   │   ├── sync.go              # 同步API
│   │   ├── works.go             # 作品API
│   │   └── upload.go            # 文件上传API
│   ├── middleware/
│   │   ├── auth.go              # JWT认证中间件
│   │   ├── cors.go              # CORS中间件
│   │   └── ratelimit.go         # 限流中间件
│   ├── models/
│   │   ├── user.go              # 用户模型
│   │   ├── work.go              # 作品模型
│   │   └── sync.go              # 同步模型
│   ├── service/
│   │   ├── auth_service.go      # 认证服务
│   │   ├── sync_service.go      # 同步服务
│   │   └── storage_service.go   # 存储服务
│   └── database/
│       ├── postgres.go          # PostgreSQL连接
│       ├── redis.go             # Redis连接
│       └── migrations/          # 数据库迁移
│           └── 001_init.sql
├── pkg/
│   ├── jwt/
│   │   └── jwt.go               # JWT工具
│   └── utils/
│       └── uuid.go              # 工具函数
├── config/
│   └── config.go                # 配置加载
├── docker-compose.yml           # Docker编排
├── Dockerfile                   # Docker镜像
├── go.mod                       # Go依赖
├── go.sum
└── README.md                    # 文档
```

---

## 📊 性能指标

### 目标性能

| 指标 | 目标值 | 说明 |
|------|--------|------|
| API 响应时间 | < 100ms | P95 |
| 同步速度 | > 1000 records/s | 增量同步 |
| 并发用户 | 10,000+ | 单实例 |
| 数据库连接池 | 100 | PostgreSQL |
| 文件上传速度 | > 10 MB/s | MinIO |

### 优化策略

1. **数据库优化**
   - 添加索引 (user_id, updated_at)
   - 使用连接池
   - 读写分离 (主从复制)

2. **缓存策略**
   - Redis 缓存用户 Session
   - 缓存频繁查询的数据
   - CDN 缓存静态文件

3. **并发优化**
   - Goroutine 池
   - 异步任务队列 (Redis)
   - 批量操作

---

## ✅ 下一步行动

### 第一阶段 (MVP - 最小可行产品)

- [ ] 创建 Go 项目结构
- [ ] 实现用户注册/登录 API
- [ ] 实现作品同步 API
- [ ] 配置 PostgreSQL 数据库
- [ ] 编写 Docker 部署配置
- [ ] 编写 API 文档

### 第二阶段 (增强功能)

- [ ] 实现文件上传 (MinIO)
- [ ] 添加 WebSocket 实时通知
- [ ] 实现冲突解决 UI
- [ ] 性能测试和优化
- [ ] 添加监控和日志

### 第三阶段 (高级功能)

- [ ] 多人协作编辑
- [ ] 版本历史管理
- [ ] 数据导出/导入
- [ ] 移动端 API

---

**设计人**: Claude Code
**设计时间**: 2025-12-28
**状态**: ✅ 架构设计完成,等待实现

**备注**:
- 本设计方案完全兼容现有桌面端 SQLite 数据结构
- 使用增量同步策略,减少网络流量
- 支持离线优先,无网络时仍可使用桌面端
- 预留扩展接口,支持未来功能升级
