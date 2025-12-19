/**
 * 导出系统类型定义
 *
 * 支持根据作品类型（短剧/小说）导出为不同格式
 * 可扩展架构，便于添加新格式
 */

import type { WorkType } from './storage';

/**
 * 导出格式枚举
 */
export enum ExportFormat {
  /** 纯文本格式 */
  TXT = 'txt',

  /** PDF文档 */
  PDF = 'pdf',

  /** Word文档 (.docx) */
  WORD = 'word',

  /** Markdown格式 */
  MARKDOWN = 'markdown',

  /** HTML格式 */
  HTML = 'html',

  /** 短剧专用：分镜脚本格式 */
  SCRIPT = 'script',

  /** 小说专用：EPUB电子书 */
  EPUB = 'epub',
}

/**
 * 不同作品类型支持的导出格式
 */
export const SUPPORTED_FORMATS: Record<WorkType, ExportFormat[]> = {
  // 短剧支持的格式
  script: [
    ExportFormat.TXT,
    ExportFormat.PDF,
    ExportFormat.WORD,
    ExportFormat.SCRIPT,  // 专业分镜脚本格式
    ExportFormat.HTML,
  ],

  // 小说支持的格式
  novel: [
    ExportFormat.TXT,
    ExportFormat.PDF,
    ExportFormat.WORD,
    ExportFormat.MARKDOWN,
    ExportFormat.EPUB,    // EPUB电子书
    ExportFormat.HTML,
  ],
};

/**
 * 导出选项接口
 */
export interface ExportOptions {
  /** 作品ID */
  workId: string;

  /** 导出格式 */
  format: ExportFormat;

  /** 导出文件保存路径（用户选择） */
  savePath?: string;

  /** 是否包含目录 */
  includeTOC?: boolean;

  /** 是否包含封面 */
  includeCover?: boolean;

  /** 封面图片路径 */
  coverImagePath?: string;

  /** 作者信息 */
  author?: string;

  /** 其他元数据 */
  metadata?: {
    publisher?: string;    // 出版社
    isbn?: string;         // ISBN号
    description?: string;  // 描述
    tags?: string[];       // 标签
  };

  /** 格式特定选项 */
  formatOptions?: {
    /** PDF选项 */
    pdf?: {
      pageSize?: 'A4' | 'A5' | 'Letter';
      fontSize?: number;
      lineHeight?: number;
    };

    /** Word选项 */
    word?: {
      template?: string;   // 模板路径
    };

    /** EPUB选项 */
    epub?: {
      language?: string;   // 语言代码
      coverImage?: string; // 封面图
    };

    /** 分镜脚本选项 */
    script?: {
      includeSceneNumbers?: boolean;  // 是否包含场次号
      includeTimecodes?: boolean;     // 是否包含时间码
    };
  };
}

/**
 * 导出进度回调
 */
export interface ExportProgress {
  /** 当前步骤 */
  step: string;

  /** 进度百分比 (0-100) */
  progress: number;

  /** 当前处理的章节索引 */
  currentChapter?: number;

  /** 总章节数 */
  totalChapters?: number;
}

/**
 * 导出结果
 */
export interface ExportResult {
  /** 是否成功 */
  success: boolean;

  /** 导出文件路径 */
  filePath?: string;

  /** 文件大小（字节） */
  fileSize?: number;

  /** 错误信息 */
  error?: string;

  /** 导出耗时（毫秒） */
  duration?: number;
}

/**
 * 导出格式元数据
 * 用于UI显示和用户选择
 */
export interface ExportFormatInfo {
  /** 格式标识 */
  format: ExportFormat;

  /** 显示名称 */
  displayName: string;

  /** 文件扩展名 */
  extension: string;

  /** 图标 */
  icon: string;

  /** 描述 */
  description: string;

  /** 是否为专业格式 */
  isProfessional?: boolean;
}

/**
 * 所有导出格式的元数据
 */
export const EXPORT_FORMAT_INFO: Record<ExportFormat, ExportFormatInfo> = {
  [ExportFormat.TXT]: {
    format: ExportFormat.TXT,
    displayName: '纯文本',
    extension: 'txt',
    icon: '📄',
    description: '简单的文本文件，兼容性最好',
  },

  [ExportFormat.PDF]: {
    format: ExportFormat.PDF,
    displayName: 'PDF文档',
    extension: 'pdf',
    icon: '📕',
    description: '专业文档格式，适合打印和分享',
  },

  [ExportFormat.WORD]: {
    format: ExportFormat.WORD,
    displayName: 'Word文档',
    extension: 'docx',
    icon: '📘',
    description: 'Microsoft Word格式，便于编辑',
  },

  [ExportFormat.MARKDOWN]: {
    format: ExportFormat.MARKDOWN,
    displayName: 'Markdown',
    extension: 'md',
    icon: '📝',
    description: '轻量级标记语言，适合技术文档',
  },

  [ExportFormat.HTML]: {
    format: ExportFormat.HTML,
    displayName: 'HTML网页',
    extension: 'html',
    icon: '🌐',
    description: '网页格式，可在浏览器中查看',
  },

  [ExportFormat.SCRIPT]: {
    format: ExportFormat.SCRIPT,
    displayName: '分镜脚本',
    extension: 'fountain',
    icon: '🎬',
    description: '专业短剧分镜格式（Fountain）',
    isProfessional: true,
  },

  [ExportFormat.EPUB]: {
    format: ExportFormat.EPUB,
    displayName: 'EPUB电子书',
    extension: 'epub',
    icon: '📚',
    description: '电子书格式，支持大多数阅读器',
    isProfessional: true,
  },
};

/**
 * 根据作品类型获取支持的导出格式信息
 *
 * @param workType 作品类型
 * @returns 支持的格式信息列表
 */
export function getSupportedFormats(workType: WorkType): ExportFormatInfo[] {
  const formats = SUPPORTED_FORMATS[workType];
  return formats.map(format => EXPORT_FORMAT_INFO[format]);
}
