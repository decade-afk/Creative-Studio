/**
 * 导出服务模块
 *
 * 提供作品导出功能：
 * 1. 调用Rust后端进行格式转换
 * 2. 文件保存和路径管理
 * 3. 导出进度追踪
 *
 * 架构设计：
 * - TypeScript层：UI交互、参数验证、进度回调
 * - Rust层：文件生成、格式转换（性能敏感操作）
 */

import { invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import type {
  ExportOptions,
  ExportResult,
  ExportFormat,
  ExportProgress,
  ExportFormatInfo,
} from '../types/export';
import type { Work } from '../types/storage';
import { getWorkById } from './workService';
import { getChaptersByWorkId } from './chapterService';
import { EXPORT_FORMAT_INFO, getSupportedFormats } from '../types/export';

/**
 * 导出作品
 * 主入口函数，协调整个导出流程
 *
 * @param options 导出选项
 * @param onProgress 进度回调函数（可选）
 * @returns Promise<ExportResult> 导出结果
 */
export async function exportWork(
  options: ExportOptions,
  onProgress?: (progress: ExportProgress) => void
): Promise<ExportResult> {
  const startTime = Date.now();

  try {
    // 1. 验证作品是否存在
    onProgress?.({ step: '正在加载作品数据...', progress: 10 });
    const work = await getWorkById(options.workId);
    if (!work) {
      throw new Error('作品不存在');
    }

    // 2. 加载所有章节
    onProgress?.({ step: '正在加载章节...', progress: 20 });
    let chapters = await getChaptersByWorkId(options.workId);
    if (chapters.length === 0) {
      throw new Error('作品没有章节，无法导出');
    }

    // 单章导出：按 chapterId 过滤
    const scopeName = options.chapterId
      ? chapters.find((c) => c.id === options.chapterId)?.title
      : undefined;
    if (options.chapterId) {
      chapters = chapters.filter((c) => c.id === options.chapterId);
      if (chapters.length === 0) {
        throw new Error('章节不存在，无法导出');
      }
    }

    // 3. 如果未指定保存路径，弹出文件选择对话框
    let savePath = options.savePath;
    if (!savePath) {
      onProgress?.({ step: '请选择保存位置...', progress: 30 });
      const formatInfo = EXPORT_FORMAT_INFO[options.format];
      const baseName = options.chapterTitle || scopeName
        ? `${work.title} - ${options.chapterTitle || scopeName}`
        : work.title;

      const selectedPath = await save({
        title: options.chapterId ? '导出章节' : '导出作品',
        defaultPath: `${baseName}.${formatInfo.extension}`,
        filters: [{
          name: formatInfo.displayName,
          extensions: [formatInfo.extension],
        }],
      });

      // 用户取消了保存
      if (!selectedPath) {
        return {
          success: false,
          error: '用户取消了导出',
        };
      }

      savePath = selectedPath;
    }

    // 4. 准备导出数据
    onProgress?.({ step: '正在准备数据...', progress: 40 });
    const exportData = {
      work: {
        id: work.id,
        title: work.title,
        type: work.type,
        description: work.description,
      },
      chapters: chapters.map(ch => ({
        id: ch.id,
        title: ch.title,
        content: ch.content,
        order: ch.order,
      })),
      options: {
        ...options,
        savePath,
      },
    };

    // 5. 调用Rust后端执行导出
    onProgress?.({ step: '正在生成文件...', progress: 50 });

    // 根据格式调用不同的Rust命令
    const result = await invokeExportCommand(options.format, exportData, onProgress);

    // 6. 完成
    const duration = Date.now() - startTime;
    onProgress?.({ step: '导出完成！', progress: 100 });

    return {
      success: true,
      filePath: savePath,
      fileSize: result.fileSize,
      duration,
    };

  } catch (error: any) {
    console.error('❌ 导出失败:', error);

    return {
      success: false,
      error: error.message || '导出失败',
      duration: Date.now() - startTime,
    };
  }
}

/**
 * 调用Rust导出命令
 * 根据不同格式调用对应的Rust函数
 *
 * @param format 导出格式
 * @param data 导出数据
 * @param onProgress 进度回调
 * @returns Promise<{ fileSize: number }> 文件大小
 */
async function invokeExportCommand(
  format: ExportFormat,
  data: any,
  onProgress?: (progress: ExportProgress) => void
): Promise<{ fileSize: number }> {
  // 根据格式选择对应的Rust命令
  const commandMap: Record<ExportFormat, string> = {
    txt: 'export_to_txt',
    pdf: 'export_to_pdf',
    word: 'export_to_word',
    markdown: 'export_to_markdown',
    html: 'export_to_html',
    script: 'export_to_script',
    epub: 'export_to_epub',
  };

  const command = commandMap[format];
  if (!command) {
    throw new Error(`不支持的导出格式: ${format}`);
  }

  try {
    // 调用Rust命令
    const result = await invoke<{ file_size: number }>(command, { data });

    onProgress?.({ step: '文件生成成功', progress: 90 });

    return {
      fileSize: result.file_size,
    };
  } catch (error: any) {
    throw new Error(`导出失败: ${error}`);
  }
}

/**
 * 批量导出作品（导出为多种格式）
 *
 * @param workId 作品ID
 * @param formats 要导出的格式列表
 * @param onProgress 进度回调
 * @returns Promise<ExportResult[]> 每种格式的导出结果
 */
export async function batchExport(
  workId: string,
  formats: ExportFormat[],
  onProgress?: (format: ExportFormat, progress: ExportProgress) => void
): Promise<ExportResult[]> {
  const results: ExportResult[] = [];

  for (let i = 0; i < formats.length; i++) {
    const format = formats[i];

    const result = await exportWork(
      { workId, format },
      (progress) => {
        onProgress?.(format, {
          ...progress,
          progress: (i / formats.length) * 100 + (progress.progress / formats.length),
        });
      }
    );

    results.push(result);
  }

  return results;
}

/**
 * 获取作品支持的导出格式
 *
 * @param work 作品对象
 * @returns ExportFormatInfo[] 支持的格式列表
 */
export function getWorkExportFormats(work: Work): ExportFormatInfo[] {
  return getSupportedFormats(work.type);
}

/**
 * 预览导出内容（不实际生成文件）
 * 返回纯文本预览
 *
 * @param workId 作品ID
 * @returns Promise<string> 预览文本
 */
export async function previewExport(workId: string): Promise<string> {
  const work = await getWorkById(workId);
  if (!work) {
    throw new Error('作品不存在');
  }

  const chapters = await getChaptersByWorkId(workId);

  // 生成简单的文本预览
  let preview = `${work.title}\n${'='.repeat(work.title.length)}\n\n`;

  if (work.description) {
    preview += `${work.description}\n\n`;
  }

  for (const chapter of chapters) {
    preview += `\n第${chapter.order}章 ${chapter.title}\n`;
    preview += `${'-'.repeat(chapter.title.length + 10)}\n\n`;

    // 移除HTML标签
    const content = chapter.content.replace(/<[^>]*>/g, '');
    preview += `${content}\n\n`;
  }

  return preview;
}
