/**
 * 文件名：writerStore.ts
 * 模块名称：WriterView 全局状态管理 Store
 *
 * 【核心功能】
 * 1. 集中管理 WriterView 的所有状态（编辑器、UI、数据）
 * 2. 提供状态更新方法和计算属性
 * 3. 优化组件间通信，避免 props drilling
 * 4. 支持持久化和性能优化（通过选择器订阅）
 *
 * 【技术要点】
 * - 使用 Zustand 作为状态管理库（轻量、无 boilerplate、性能优秀）
 * - 状态分为三大类：EditorState（编辑器）、UIState（界面）、DataState（数据）
 * - 使用 TypeScript 接口确保类型安全
 * - 提供选择器函数优化订阅性能（避免不必要的重渲染）
 *
 * 【重要注意事项】
 * 1. 状态更新是异步的，不要在 set 函数中立即读取新状态
 * 2. 使用选择器（selectors）订阅状态以提升性能
 * 3. 计算属性（getCurrentWork、getCurrentChapter）每次调用都会重新计算，应缓存结果或使用选择器
 * 4. shouldSyncContent 标志用于控制内容同步时机，避免频繁写入数据库
 *
 * 【使用示例】
 * ```tsx
 * // 在组件中使用 store
 * import { useWriterStore } from '@/stores/writerStore';
 *
 * function MyComponent() {
 *   // 读取状态
 *   const content = useWriterStore(state => state.content);
 *   const getCurrentWork = useWriterStore(state => state.getCurrentWork);
 *   const setEditorContent = useWriterStore(state => state.setEditorContent);
 *
 *   // 使用状态
 *   const currentWork = getCurrentWork();
 *   const handleContentChange = (newContent: string) => {
 *     setEditorContent(newContent);
 *   };
 *
 *   return <div>{content}</div>;
 * }
 * ```
 */

import { create } from 'zustand';
import type { Work, Chapter } from '../types/storage';

// ============================================================================
// 状态接口定义
// ============================================================================

/**
 * 编辑器状态接口
 *
 * 管理富文本编辑器相关的状态
 */
interface EditorState {
  /** 编辑器当前内容（HTML 格式） */
  content: string;

  /** 当前字数统计（中文字符 + 英文单词） */
  wordCount: number;

  /** 是否正在输入法组合中（IME 输入状态）
   *
   * 【重要】在中文输入法输入过程中，此标志为 true
   * - true: 正在输入拼音/选词，不应触发自动保存
   * - false: 输入完成，可以触发自动保存
   */
  isComposing: boolean;

  /** 是否应该同步内容到数据库
   *
   * 【设计说明】
   * - 用于控制内容同步的时机，避免每次按键都写入数据库
   * - 通常在用户停止输入一段时间后（如 500ms）才设置为 true
   * - 配合防抖（debounce）使用，提升性能
   */
  shouldSyncContent: boolean;
}

/**
 * UI 状态接口
 *
 * 管理界面显示相关的状态
 */
interface UIState {
  /** 是否显示侧边栏抽屉 */
  showDrawer: boolean;

  /** 是否显示导出对话框 */
  showExportDialog: boolean;

  /** 是否显示新建作品对话框 */
  showNewWorkDialog: boolean;

  /** 是否显示新建章节对话框 */
  showNewChapterDialog: boolean;

  /** 是否显示 AI 助手面板 */
  showAiPanel: boolean;

  /** 当前选中的图标 emoji（用于创建新作品） */
  selectedIcon: string;

  /** 侧边栏宽度（像素）
   *
   * 【范围说明】
   * - 最小值：200px
   * - 最大值：500px
   * - 默认值：256px
   */
  sidebarWidth: number;

  /** 是否正在调整侧边栏宽度
   *
   * 【用途】
   * - true: 用户正在拖拽调整侧边栏，此时应禁用 hover 效果
   * - false: 调整完成，恢复正常交互
   */
  isResizing: boolean;
}

/**
 * 数据状态接口
 *
 * 管理应用数据相关的状态
 */
interface DataState {
  /** 所有作品列表 */
  works: Work[];

  /** 当前作品的所有章节列表 */
  chapters: Chapter[];

  /** 当前选中的作品 ID */
  currentWorkId: string;

  /** 当前选中的章节 ID */
  currentChapterId: string;

  /** 数据库是否已就绪
   *
   * 【用途】
   * - false: 正在初始化数据库，显示加载状态
   * - true: 数据库已加载完成，可以正常操作
   */
  dbReady: boolean;

  /** 导出进度信息
   *
   * 【格式说明】
   * - step: 当前步骤描述（如"正在生成 PDF..."）
   * - progress: 进度百分比（0-100）
   * - null: 没有正在进行的导出任务
   */
  exportProgress: { step: string; progress: number } | null;

  /** 正在删除的项目信息
   *
   * 【用途】
   * - 用于显示删除确认对话框
   * - type: 删除类型（'work' | 'chapter'）
   * - id: 要删除的项目 ID
   * - null: 没有待删除的项目
   */
  deletingItem: { type: 'work' | 'chapter'; id: string } | null;
}

/**
 * Writer Store 完整接口
 *
 * 继承所有状态接口，并添加操作方法
 */
interface WriterStore extends EditorState, UIState, DataState {
  // ==========================================================================
  // 编辑器操作方法
  // ==========================================================================

  /**
   * 设置编辑器内容
   *
   * @param content - 新的编辑器内容（HTML 格式）
   *
   * 【使用场景】
   * - 用户输入内容时
   * - 切换章节时加载新内容
   * - AI 生成内容后追加
   */
  setEditorContent: (content: string) => void;

  /**
   * 设置字数统计
   *
   * @param count - 新的字数
   *
   * 【计算规则】
   * - 中文字符：每个汉字算 1 个字
   * - 英文单词：按空格分隔计算
   * - 标点符号：计入字数
   * - 空白字符：不计入
   */
  setWordCount: (count: number) => void;

  /**
   * 设置输入法组合状态
   *
   * @param isComposing - 是否正在输入法组合中
   *
   * 【重要说明】
   * - 必须在 onCompositionStart 事件中设置为 true
   * - 必须在 onCompositionEnd 事件中设置为 false
   * - 影响自动保存的触发时机
   */
  setIsComposing: (isComposing: boolean) => void;

  /**
   * 设置内容同步标志
   *
   * @param shouldSync - 是否应该同步到数据库
   *
   * 【使用建议】
   * - 配合防抖函数使用，避免频繁写入
   * - 示例：debounce(() => setShouldSyncContent(true), 500)
   */
  setShouldSyncContent: (shouldSync: boolean) => void;

  // ==========================================================================
  // UI 操作方法
  // ==========================================================================

  /**
   * 设置侧边栏显示状态
   *
   * @param show - true 显示，false 隐藏
   */
  setShowDrawer: (show: boolean) => void;

  /**
   * 切换侧边栏显示状态
   *
   * 【使用场景】
   * - 点击侧边栏切换按钮
   * - 响应式布局自动切换
   */
  toggleDrawer: () => void;

  /**
   * 设置 AI 助手面板显示状态
   *
   * @param show - true 显示，false 隐藏
   */
  setShowAiPanel: (show: boolean) => void;

  /**
   * 切换 AI 助手面板显示状态
   */
  toggleAiPanel: () => void;

  /**
   * 设置导出对话框显示状态
   *
   * @param show - true 显示，false 隐藏
   */
  setShowExportDialog: (show: boolean) => void;

  /**
   * 设置新建作品对话框显示状态
   *
   * @param show - true 显示，false 隐藏
   */
  setShowNewWorkDialog: (show: boolean) => void;

  /**
   * 设置新建章节对话框显示状态
   *
   * @param show - true 显示，false 隐藏
   */
  setShowNewChapterDialog: (show: boolean) => void;

  /**
   * 设置选中的图标
   *
   * @param icon - 图标 emoji（如 '📖', '🎬'）
   *
   * 【使用场景】
   * - 用户在新建作品对话框中选择图标
   * - 默认值：根据作品类型设置（小说: 📖, 短剧: 🎬）
   */
  setSelectedIcon: (icon: string) => void;

  /**
   * 设置侧边栏宽度
   *
   * @param width - 新的宽度（像素）
   *
   * 【限制】
   * - 最小值：200px
   * - 最大值：500px
   * - 超出范围会被限制在边界值
   */
  setSidebarWidth: (width: number) => void;

  /**
   * 设置侧边栏调整状态
   *
   * @param isResizing - 是否正在调整
   *
   * 【使用场景】
   * - onMouseDown: setIsResizing(true)
   * - onMouseUp: setIsResizing(false)
   */
  setIsResizing: (isResizing: boolean) => void;

  // ==========================================================================
  // 数据操作方法
  // ==========================================================================

  /**
   * 设置作品列表
   *
   * @param works - 新的作品列表
   *
   * 【使用场景】
   * - 从数据库加载作品列表
   * - 创建/删除作品后更新列表
   */
  setWorks: (works: Work[]) => void;

  /**
   * 设置章节列表
   *
   * @param chapters - 新的章节列表
   *
   * 【使用场景】
   * - 从数据库加载章节列表
   * - 创建/删除章节后更新列表
   */
  setChapters: (chapters: Chapter[]) => void;

  /**
   * 设置当前作品 ID
   *
   * @param id - 作品 ID
   *
   * 【副作用】
   * - 切换作品时会自动清空当前章节 ID
   * - 会触发重新加载该作品的章节列表
   */
  setCurrentWorkId: (id: string) => void;

  /**
   * 设置当前章节 ID
   *
   * @param id - 章节 ID
   *
   * 【副作用】
   * - 切换章节时会自动加载章节内容到编辑器
   * - 会触发字数统计更新
   */
  setCurrentChapterId: (id: string) => void;

  /**
   * 设置数据库就绪状态
   *
   * @param ready - 数据库是否已就绪
   *
   * 【使用场景】
   * - 应用启动时：false → true
   * - 数据库错误时：true → false
   */
  setDbReady: (ready: boolean) => void;

  /**
   * 设置导出进度
   *
   * @param progress - 进度信息，null 表示没有导出任务
   *
   * 【使用场景】
   * - 开始导出：{ step: '准备中...', progress: 0 }
   * - 导出中：{ step: '正在生成 PDF...', progress: 50 }
   * - 完成或取消：null
   */
  setExportProgress: (progress: { step: string; progress: number } | null) => void;

  /**
   * 设置待删除项目
   *
   * @param item - 待删除项目信息，null 表示取消删除
   *
   * 【使用场景】
   * - 用户点击删除按钮：设置待删除项目，显示确认对话框
   * - 用户确认删除：执行删除操作，然后清空
   * - 用户取消删除：直接清空
   */
  setDeletingItem: (item: { type: 'work' | 'chapter'; id: string } | null) => void;

  // ==========================================================================
  // 计算属性方法
  // ==========================================================================

  /**
   * 获取当前选中的作品对象
   *
   * @returns 当前作品对象，未找到返回 undefined
   *
   * 【性能提示】
   * - 每次调用都会重新遍历 works 数组
   * - 建议使用 selectCurrentWork 选择器订阅
   *
   * 【使用示例】
   * ```tsx
   * const getCurrentWork = useWriterStore(state => state.getCurrentWork);
   * const currentWork = getCurrentWork();
   * ```
   */
  getCurrentWork: () => Work | undefined;

  /**
   * 获取当前选中的章节对象
   *
   * @returns 当前章节对象，未找到返回 undefined
   *
   * 【性能提示】
   * - 每次调用都会重新遍历 chapters 数组
   * - 建议使用 selectCurrentChapter 选择器订阅
   *
   * 【使用示例】
   * ```tsx
   * const getCurrentChapter = useWriterStore(state => state.getCurrentChapter);
   * const currentChapter = getCurrentChapter();
   * ```
   */
  getCurrentChapter: () => Chapter | undefined;
}

// ============================================================================
// Store 创建
// ============================================================================

/**
 * Writer Store 实例
 *
 * 【创建方式】
 * - 使用 Zustand 的 create 函数创建
 * - 参数是一个函数，接收 set 和 get 方法
 * - set: 更新状态的方法
 * - get: 获取当前状态的方法
 *
 * 【初始值说明】
 * - 编辑器内容：空字符串
 * - 字数：0
 * - 侧边栏宽度：256px（标准宽度）
 * - 所有对话框：默认隐藏
 * - 数据库：未就绪状态
 *
 * 【性能优化】
 * - 使用浅比较（shallow comparison）避免不必要的重渲染
 * - 避免在 set 函数中直接修改对象，应创建新对象
 */
export const useWriterStore = create<WriterStore>((set, get) => ({
  // ==========================================================================
  // 初始状态 - 编辑器
  // ==========================================================================
  content: '',                    // 编辑器内容为空
  wordCount: 0,                   // 字数初始为 0
  isComposing: false,             // 未在输入法组合中
  shouldSyncContent: false,       // 不需要同步内容

  // ==========================================================================
  // 初始状态 - UI
  // ==========================================================================
  showDrawer: false,              // 侧边栏默认隐藏
  showAiPanel: false,             // AI 助手面板默认隐藏
  showExportDialog: false,        // 导出对话框默认隐藏
  showNewWorkDialog: false,       // 新建作品对话框默认隐藏
  showNewChapterDialog: false,    // 新建章节对话框默认隐藏
  selectedIcon: '',               // 未选择图标
  sidebarWidth: 256,              // 侧边栏默认宽度 256px
  isResizing: false,              // 未在调整宽度

  // ==========================================================================
  // 初始状态 - 数据
  // ==========================================================================
  works: [],                      // 作品列表为空
  chapters: [],                   // 章节列表为空
  currentWorkId: '',              // 未选择作品
  currentChapterId: '',           // 未选择章节
  dbReady: false,                 // 数据库未就绪
  exportProgress: null,           // 没有导出任务
  deletingItem: null,             // 没有待删除项目

  // ==========================================================================
  // 编辑器操作实现
  // ==========================================================================

  /**
   * 更新编辑器内容
   *
   * 【实现说明】
   * - 直接使用 set 更新 content 字段
   * - 不影响其他状态
   */
  setEditorContent: (content) => set({ content }),

  /**
   * 更新字数统计
   *
   * 【实现说明】
   * - 直接更新 wordCount 字段
   * - 字数计算在组件层完成，这里只负责存储
   */
  setWordCount: (wordCount) => set({ wordCount }),

  /**
   * 更新输入法组合状态
   *
   * 【实现说明】
   * - 直接更新 isComposing 字段
   * - 影响自动保存的触发逻辑
   */
  setIsComposing: (isComposing) => set({ isComposing }),

  /**
   * 更新内容同步标志
   *
   * 【实现说明】
   * - 直接更新 shouldSyncContent 字段
   * - 通常配合防抖函数使用
   */
  setShouldSyncContent: (shouldSyncContent) => set({ shouldSyncContent }),

  // ==========================================================================
  // UI 操作实现
  // ==========================================================================

  /**
   * 更新侧边栏显示状态
   *
   * 【实现说明】
   * - 直接设置 showDrawer 字段
   */
  setShowDrawer: (showDrawer) => set({ showDrawer }),

  /**
   * 切换侧边栏显示状态
   *
   * 【实现说明】
   * - 使用函数式更新，基于当前状态取反
   * - 避免闭包问题
   */
  toggleDrawer: () => set((state) => ({ showDrawer: !state.showDrawer })),

  setShowAiPanel: (showAiPanel) => set({ showAiPanel }),

  toggleAiPanel: () => set((state) => ({ showAiPanel: !state.showAiPanel })),

  /**
   * 更新导出对话框显示状态
   *
   * 【实现说明】
   * - 直接设置 showExportDialog 字段
   */
  setShowExportDialog: (showExportDialog) => set({ showExportDialog }),

  /**
   * 更新新建作品对话框显示状态
   *
   * 【实现说明】
   * - 直接设置 showNewWorkDialog 字段
   */
  setShowNewWorkDialog: (showNewWorkDialog) => set({ showNewWorkDialog }),

  /**
   * 更新新建章节对话框显示状态
   *
   * 【实现说明】
   * - 直接设置 showNewChapterDialog 字段
   */
  setShowNewChapterDialog: (showNewChapterDialog) => set({ showNewChapterDialog }),

  /**
   * 更新选中的图标
   *
   * 【实现说明】
   * - 直接设置 selectedIcon 字段
   */
  setSelectedIcon: (selectedIcon) => set({ selectedIcon }),

  /**
   * 更新侧边栏宽度
   *
   * 【实现说明】
   * - 直接设置 sidebarWidth 字段
   * - 在组件层添加范围限制（200-500px）
   */
  setSidebarWidth: (sidebarWidth) => set({ sidebarWidth }),

  /**
   * 更新侧边栏调整状态
   *
   * 【实现说明】
   * - 直接设置 isResizing 字段
   * - 用于控制鼠标样式和交互行为
   */
  setIsResizing: (isResizing) => set({ isResizing }),

  // ==========================================================================
  // 数据操作实现
  // ==========================================================================

  /**
   * 更新作品列表
   *
   * 【实现说明】
   * - 直接替换整个 works 数组
   * - 触发订阅该状态的组件重渲染
   */
  setWorks: (works) => set({ works }),

  /**
   * 更新章节列表
   *
   * 【实现说明】
   * - 直接替换整个 chapters 数组
   * - 触发订阅该状态的组件重渲染
   */
  setChapters: (chapters) => set({ chapters }),

  /**
   * 更新当前作品 ID
   *
   * 【实现说明】
   * - 直接设置 currentWorkId 字段
   * - 切换作品时需要同时清空 currentChapterId
   */
  setCurrentWorkId: (currentWorkId) => set({ currentWorkId }),

  /**
   * 更新当前章节 ID
   *
   * 【实现说明】
   * - 直接设置 currentChapterId 字段
   * - 切换章节时需要加载对应内容
   */
  setCurrentChapterId: (currentChapterId) => set({ currentChapterId }),

  /**
   * 更新数据库就绪状态
   *
   * 【实现说明】
   * - 直接设置 dbReady 字段
   * - 控制加载界面的显示/隐藏
   */
  setDbReady: (dbReady) => set({ dbReady }),

  /**
   * 更新导出进度
   *
   * 【实现说明】
   * - 设置 exportProgress 字段
   * - null 表示没有导出任务
   */
  setExportProgress: (exportProgress) => set({ exportProgress }),

  /**
   * 更新待删除项目
   *
   * 【实现说明】
   * - 设置 deletingItem 字段
   * - null 表示取消删除
   */
  setDeletingItem: (deletingItem) => set({ deletingItem }),

  // ==========================================================================
  // 计算属性实现
  // ==========================================================================

  /**
   * 获取当前作品对象
   *
   * 【实现说明】
   * - 使用 get() 获取当前状态
   * - 在 works 数组中查找匹配 currentWorkId 的作品
   * - 未找到返回 undefined
   *
   * 【性能注意】
   * - 每次调用都会重新遍历数组
   * - 建议使用 selectCurrentWork 选择器
   */
  getCurrentWork: () => {
    const { works, currentWorkId } = get();  // 获取当前状态
    return works.find((w) => w.id === currentWorkId);  // 查找匹配的作品
  },

  /**
   * 获取当前章节对象
   *
   * 【实现说明】
   * - 使用 get() 获取当前状态
   * - 在 chapters 数组中查找匹配 currentChapterId 的章节
   * - 未找到返回 undefined
   *
   * 【性能注意】
   * - 每次调用都会重新遍历数组
   * - 建议使用 selectCurrentChapter 选择器
   */
  getCurrentChapter: () => {
    const { chapters, currentChapterId } = get();  // 获取当前状态
    return chapters.find((c) => c.id === currentChapterId);  // 查找匹配的章节
  },
}));

// ============================================================================
// 选择器函数
// ============================================================================

/**
 * 选择器：获取当前作品
 *
 * 【用途】
 * - 在组件中订阅当前作品对象
 * - 仅当作品变化时才重渲染
 *
 * 【使用示例】
 * ```tsx
 * const currentWork = useWriterStore(selectCurrentWork);
 * ```
 *
 * @param state - Store 状态
 * @returns 当前作品对象或 undefined
 */
export const selectCurrentWork = (state: WriterStore) => state.getCurrentWork();

/**
 * 选择器：获取当前章节
 *
 * 【用途】
 * - 在组件中订阅当前章节对象
 * - 仅当章节变化时才重渲染
 *
 * 【使用示例】
 * ```tsx
 * const currentChapter = useWriterStore(selectCurrentChapter);
 * ```
 *
 * @param state - Store 状态
 * @returns 当前章节对象或 undefined
 */
export const selectCurrentChapter = (state: WriterStore) => state.getCurrentChapter();

/**
 * 选择器：获取编辑器状态
 *
 * 【用途】
 * - 在组件中订阅编辑器相关状态
 * - 包含内容、字数、输入法状态
 *
 * 【使用示例】
 * ```tsx
 * const { content, wordCount, isComposing } = useWriterStore(selectEditorState);
 * ```
 *
 * @param state - Store 状态
 * @returns 编辑器状态对象
 */
export const selectEditorState = (state: WriterStore) => ({
  content: state.content,              // 编辑器内容
  wordCount: state.wordCount,          // 字数统计
  isComposing: state.isComposing,      // 输入法状态
});

/**
 * 选择器：获取 UI 状态
 *
 * 【用途】
 * - 在组件中订阅 UI 相关状态
 * - 包含对话框显示状态、侧边栏状态
 *
 * 【使用示例】
 * ```tsx
 * const { showDrawer, showExportDialog, sidebarWidth } = useWriterStore(selectUIState);
 * ```
 *
 * @param state - Store 状态
 * @returns UI 状态对象
 */
export const selectUIState = (state: WriterStore) => ({
  showDrawer: state.showDrawer,              // 侧边栏显示状态
  showExportDialog: state.showExportDialog,  // 导出对话框显示状态
  sidebarWidth: state.sidebarWidth,          // 侧边栏宽度
});