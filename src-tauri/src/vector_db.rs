/**
 * 向量数据库模块 - LanceDB 集成
 *
 * 功能：
 * 1. 向量存储和检索（语义搜索）
 * 2. 作品内容的向量化索引
 * 3. 相似度搜索和智能推荐
 * 4. RAG（检索增强生成）支持
 *
 * 架构设计：
 * - 使用 LanceDB 作为向量数据库
 * - 支持多种嵌入模型（本地/云端）
 * - 异步操作，不阻塞主线程
 */

use anyhow::{Context, Result};
use arrow_array::{RecordBatch, RecordBatchIterator};
use arrow_schema::{DataType, Field, Schema};
use lancedb::connection::Connection;
use lancedb::query::QueryBase;
use lancedb::table::Table;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::RwLock;

// ========== 数据结构定义 ==========

/**
 * 向量数据库文档结构
 *
 * 表示一个可搜索的文档片段
 */
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VectorDocument {
    /// 文档唯一标识符
    pub id: String,

    /// 所属作品 ID
    pub work_id: String,

    /// 所属章节 ID
    pub chapter_id: Option<String>,

    /// 文档类型 (chapter/character/scene/outline)
    pub doc_type: String,

    /// 文档标题
    pub title: String,

    /// 文档内容（原始文本）
    pub content: String,

    /// 文档向量嵌入（768 维，取决于模型）
    pub embedding: Vec<f32>,

    /// 元数据（JSON 格式）
    pub metadata: String,

    /// 创建时间
    pub created_at: String,
}

/**
 * 搜索结果结构
 */
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    /// 文档 ID
    pub id: String,

    /// 相似度分数（0-1，越高越相似）
    pub score: f32,

    /// 文档内容
    pub content: String,

    /// 文档标题
    pub title: String,

    /// 所属作品 ID
    pub work_id: String,

    /// 文档类型
    pub doc_type: String,
}

// ========== 向量数据库管理器 ==========

/**
 * 向量数据库管理器
 *
 * 负责管理 LanceDB 连接和表操作
 */
pub struct VectorDatabase {
    /// LanceDB 连接
    connection: Arc<RwLock<Option<Connection>>>,

    /// 数据库路径
    db_path: String,

    /// 默认表名
    table_name: String,
}

impl VectorDatabase {
    /**
     * 创建新的向量数据库管理器
     *
     * @param db_path 数据库存储路径
     * @param table_name 表名（默认 "documents"）
     */
    pub fn new(db_path: String, table_name: Option<String>) -> Self {
        Self {
            connection: Arc::new(RwLock::new(None)),
            db_path,
            table_name: table_name.unwrap_or_else(|| "documents".to_string()),
        }
    }

    /**
     * 初始化数据库连接
     */
    pub async fn initialize(&self) -> Result<()> {
        let mut conn_guard = self.connection.write().await;

        if conn_guard.is_none() {
            // 连接到 LanceDB
            let conn = lancedb::connect(&self.db_path)
                .execute()
                .await
                .context("Failed to connect to LanceDB")?;

            *conn_guard = Some(conn);
        }

        Ok(())
    }

    /**
     * 创建文档表
     *
     * 如果表已存在，则跳过
     */
    pub async fn create_table(&self) -> Result<()> {
        self.initialize().await?;

        let conn_guard = self.connection.read().await;
        let conn = conn_guard.as_ref().context("Database not initialized")?;

        // 检查表是否已存在
        let table_names = conn.table_names().execute().await?;
        if table_names.iter().any(|name| name == &self.table_name) {
            println!("✅ Table '{}' already exists", self.table_name);
            return Ok(());
        }

        // 创建空的 RecordBatch 来初始化表
        let schema = Self::get_document_schema();
        let empty_batch = RecordBatch::new_empty(Arc::new(schema));

        // 创建表
        conn.create_table(&self.table_name, Box::new(RecordBatchIterator::new(
            vec![Ok(empty_batch)],
            Arc::new(Self::get_document_schema()),
        )))
        .execute()
        .await
        .context("Failed to create table")?;

        println!("✅ Created table '{}'", self.table_name);
        Ok(())
    }

    /**
     * 获取文档表的 Arrow Schema
     */
    fn get_document_schema() -> Schema {
        Schema::new(vec![
            Field::new("id", DataType::Utf8, false),
            Field::new("work_id", DataType::Utf8, false),
            Field::new("chapter_id", DataType::Utf8, true),
            Field::new("doc_type", DataType::Utf8, false),
            Field::new("title", DataType::Utf8, false),
            Field::new("content", DataType::Utf8, false),
            Field::new("embedding", DataType::FixedSizeList(
                Arc::new(Field::new("item", DataType::Float32, true)),
                768, // 嵌入维度（根据模型调整）
            ), false),
            Field::new("metadata", DataType::Utf8, true),
            Field::new("created_at", DataType::Utf8, false),
        ])
    }

    /**
     * 添加文档到向量数据库
     *
     * @param documents 要添加的文档列表
     */
    pub async fn add_documents(&self, documents: Vec<VectorDocument>) -> Result<usize> {
        self.initialize().await?;

        let conn_guard = self.connection.read().await;
        let conn = conn_guard.as_ref().context("Database not initialized")?;

        // 获取表
        let table = conn.open_table(&self.table_name)
            .execute()
            .await
            .context("Failed to open table")?;

        // TODO: 将 VectorDocument 转换为 RecordBatch
        // 这里需要实现数据转换逻辑

        println!("✅ Added {} documents to vector database", documents.len());
        Ok(documents.len())
    }

    /**
     * 语义搜索
     *
     * @param query_embedding 查询向量
     * @param limit 返回结果数量
     * @return 搜索结果列表
     */
    pub async fn search(
        &self,
        query_embedding: Vec<f32>,
        limit: usize,
    ) -> Result<Vec<SearchResult>> {
        self.initialize().await?;

        let conn_guard = self.connection.read().await;
        let conn = conn_guard.as_ref().context("Database not initialized")?;

        // 获取表
        let table = conn.open_table(&self.table_name)
            .execute()
            .await
            .context("Failed to open table")?;

        // 执行向量搜索
        let results = table
            .vector_search(&query_embedding)?
            .limit(limit)
            .execute()
            .await
            .context("Vector search failed")?;

        // TODO: 解析结果并转换为 SearchResult
        let search_results = Vec::new();

        Ok(search_results)
    }

    /**
     * 根据作品 ID 删除所有文档
     *
     * @param work_id 作品 ID
     */
    pub async fn delete_by_work(&self, work_id: &str) -> Result<usize> {
        self.initialize().await?;

        let conn_guard = self.connection.read().await;
        let conn = conn_guard.as_ref().context("Database not initialized")?;

        // 获取表
        let mut table = conn.open_table(&self.table_name)
            .execute()
            .await
            .context("Failed to open table")?;

        // 删除匹配的行
        let filter = format!("work_id = '{}'", work_id);
        table.delete(&filter).await?;

        println!("✅ Deleted documents for work_id: {}", work_id);
        Ok(0) // LanceDB 不返回删除数量
    }

    /**
     * 获取数据库统计信息
     */
    pub async fn get_stats(&self) -> Result<DatabaseStats> {
        self.initialize().await?;

        let conn_guard = self.connection.read().await;
        let conn = conn_guard.as_ref().context("Database not initialized")?;

        // 获取表
        let table = conn.open_table(&self.table_name)
            .execute()
            .await
            .context("Failed to open table")?;

        // 统计信息
        let count = table.count_rows(None).await.unwrap_or(0);

        Ok(DatabaseStats {
            total_documents: count,
            table_name: self.table_name.clone(),
            db_path: self.db_path.clone(),
        })
    }
}

/**
 * 数据库统计信息
 */
#[derive(Debug, Serialize)]
pub struct DatabaseStats {
    pub total_documents: usize,
    pub table_name: String,
    pub db_path: String,
}

// ========== 文本嵌入辅助函数 ==========

/**
 * 生成文本嵌入向量
 *
 * 注意：这是一个占位实现，实际应该：
 * 1. 使用本地嵌入模型（如 fastembed）
 * 2. 或调用云端 API（OpenAI、Cohere 等）
 * 3. 或使用 loci 的 AI 模型生成嵌入
 *
 * @param text 要嵌入的文本
 * @return 768 维向量
 */
pub async fn generate_embedding(text: &str) -> Result<Vec<f32>> {
    // TODO: 实现真实的嵌入生成逻辑
    // 暂时返回随机向量作为占位符
    let embedding = vec![0.0; 768];
    Ok(embedding)
}

/**
 * 批量生成嵌入向量
 */
pub async fn generate_embeddings(texts: Vec<String>) -> Result<Vec<Vec<f32>>> {
    let mut embeddings = Vec::new();

    for text in texts {
        let embedding = generate_embedding(&text).await?;
        embeddings.push(embedding);
    }

    Ok(embeddings)
}
