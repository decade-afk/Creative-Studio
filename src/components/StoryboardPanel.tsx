/**
 * 文件名：StoryboardPanel.tsx
 * 模块名称：AI 分镜生成侧边抽屉
 *
 * 【核心功能】
 * 1. 读取当前章节正文，AI 生成分镜镜头列表（JSON 协议，流式接收）
 * 2. 预览解析结果（镜头卡片：景别/运镜/时长），可重新生成
 * 3. 一键保存到分镜库（关联当前作品与章节，order 自动续接）
 * 4. 展示当前章节已有的分镜与总时长
 *
 * 【数据流】
 * 生成结果只在前端暂存，点击保存才批量写入 storyboards 表，
 * 之后在导演视图的分镜 Tab 中可见。
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useWriterStore } from '../stores/writerStore';
import { useToast } from './Toast';
import { loadConfig } from '../services/configService';
import {
  aiChatStream,
  aiCancel,
  buildStoryboardMessages,
  parseStoryboardJson,
  type ParsedStoryboard,
  type AiConfig,
} from '../services/aiService';
import {
  getStoryboardsByChapterId,
  createStoryboard,
} from '../services/storyboardService';

/** 镜头类型显示 */
const SHOT_LABELS: Record<string, string> = {
  wide: '🎞️ 远景',
  medium: '📷 中景',
  close: '🔍 近景',
  extreme_close: '🔎 特写',
};

/** 运镜显示 */
const MOVE_LABELS: Record<string, string> = {
  static: '📍 固定',
  pan: '↔️ 摇镜',
  tilt: '↕️ 倾斜',
  zoom: '🔍 变焦',
  dolly: '🎬 移动',
  crane: '🏗️ 升降',
};

interface StoryboardPanelProps {
  /** 编辑器 DOM 引用（读取章节正文） */
  editorRef: React.RefObject<HTMLDivElement | null>;
  /** 关闭抽屉 */
  onClose: () => void;
}

/**
 * AI 分镜生成抽屉
 */
export default function StoryboardPanel({ editorRef, onClose }: StoryboardPanelProps) {
  const { showToast } = useToast();
  const currentWorkId = useWriterStore((state) => state.currentWorkId);
  const currentChapterId = useWriterStore((state) => state.currentChapterId);
  const chapters = useWriterStore((state) => state.chapters);

  const currentChapter = chapters.find((c) => c.id === currentChapterId);

  const [config, setConfig] = useState<AiConfig | null>(null);
  const [shots, setShots] = useState<ParsedStoryboard[]>([]);
  const [rawOutput, setRawOutput] = useState('');
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [parseFailed, setParseFailed] = useState(false);
  const [existing, setExisting] = useState<{ count: number; totalDuration: number }>({ count: 0, totalDuration: 0 });

  const requestIdRef = useRef<string | null>(null);

  /** 加载 AI 配置与当前章节已有的分镜 */
  const refreshExisting = useCallback(async () => {
    if (!currentWorkId || !currentChapterId) return;
    try {
      const boards = await getStoryboardsByChapterId(currentWorkId, currentChapterId);
      setExisting({
        count: boards.length,
        totalDuration: boards.reduce((sum, b) => sum + (b.duration || 0), 0),
      });
    } catch {
      // 统计失败不阻塞
    }
  }, [currentWorkId, currentChapterId]);

  useEffect(() => {
    loadConfig().then((c) => setConfig(c.ai)).catch(() => undefined);
  }, []);

  useEffect(() => {
    refreshExisting();
  }, [refreshExisting]);

  /** 生成结束后的统一处理：解析 JSON */
  const finishParsing = useCallback((text: string) => {
    const parsed = parseStoryboardJson(text);
    setShots(parsed);
    setParseFailed(parsed.length === 0);
    if (parsed.length === 0) {
      showToast('未能从 AI 输出中解析出分镜，请重试', 'warning');
    }
  }, [showToast]);

  /** 生成分镜 */
  const handleGenerate = useCallback(async () => {
    if (!config || !config.baseUrl || !config.model) {
      showToast('请先在设置中配置 AI 服务', 'warning');
      return;
    }
    if (!currentChapter) {
      showToast('请先选择章节', 'warning');
      return;
    }
    const chapterHtml = editorRef.current?.innerHTML || currentChapter.content || '';
    if (!chapterHtml.replace(/<[^>]*>/g, '').trim()) {
      showToast('当前章节还没有正文，先写点内容再生成', 'info');
      return;
    }

    setRunning(true);
    setShots([]);
    setRawOutput('');
    setParseFailed(false);

    let accumulated = '';
    try {
      requestIdRef.current = await new Promise<string>((resolve, reject) => {
        aiChatStream(config, buildStoryboardMessages(currentChapter.title, chapterHtml), {
          onDelta: (delta) => {
            accumulated += delta;
            setRawOutput(accumulated);
          },
          onError: (message) => reject(new Error(message)),
        }).then(resolve).catch(reject);
      });
      finishParsing(accumulated);
    } catch (error: any) {
      // 已有部分输出时仍尝试解析
      if (accumulated) {
        finishParsing(accumulated);
      } else {
        showToast(error.message || 'AI 请求失败', 'error');
      }
    } finally {
      setRunning(false);
      requestIdRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, currentChapter, currentChapterId]);

  /** 停止生成 */
  const handleStop = useCallback(() => {
    if (requestIdRef.current) {
      aiCancel(requestIdRef.current);
    }
    setRunning(false);
  }, []);

  /** 保存到分镜库 */
  const handleSave = useCallback(async () => {
    if (!currentWorkId || shots.length === 0) return;
    setSaving(true);
    try {
      // order 续接该章节已有的分镜数量
      const existingBoards = await getStoryboardsByChapterId(currentWorkId, currentChapterId);
      const baseOrder = existingBoards.length;
      for (let i = 0; i < shots.length; i++) {
        await createStoryboard({
          work_id: currentWorkId,
          chapter_id: currentChapterId,
          scene_id: null,
          title: shots[i].title,
          description: shots[i].description,
          shot_type: shots[i].shot_type,
          camera_movement: shots[i].camera_movement,
          duration: shots[i].duration,
          order: baseOrder + i,
        });
      }
      showToast(`已保存 ${shots.length} 个分镜，可在导演视图查看`, 'success');
      setShots([]);
      setRawOutput('');
      await refreshExisting();
    } catch (error: any) {
      showToast(error.message || '保存失败', 'error');
    } finally {
      setSaving(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shots, currentWorkId, currentChapterId, refreshExisting, showToast]);

  const isConfigured = config && config.baseUrl && config.model;

  return (
    <div className="w-96 bg-surface-secondary border-l border-surface-border flex flex-col">
      {/* 头部 */}
      <div className="h-12 border-b border-surface-border flex items-center justify-between px-4">
        <span className="text-sm font-semibold text-on-surface flex items-center gap-2">
          <svg className="w-4 h-4 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
          </svg>
          AI 分镜生成
        </span>
        <button onClick={onClose} className="text-on-surface-secondary hover:text-on-surface">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* 已有分镜统计 */}
      <div className="px-4 pt-3 text-xs text-on-surface-secondary">
        本章已有 {existing.count} 个分镜
        {existing.totalDuration > 0 && `，总时长 ${Math.floor(existing.totalDuration / 60)} 分 ${Math.round(existing.totalDuration % 60)} 秒`}
      </div>

      {/* 操作区 */}
      <div className="flex items-center gap-2 p-3">
        {running ? (
          <button
            onClick={handleStop}
            className="flex-1 px-3 py-1.5 text-sm rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors"
          >
            ■ 停止生成
          </button>
        ) : (
          <button
            onClick={handleGenerate}
            disabled={!isConfigured || !currentChapterId}
            className="flex-1 px-3 py-1.5 text-sm rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title={isConfigured ? '根据当前章节正文生成分镜' : '请先在设置中配置 AI 服务'}
          >
            ✨ {shots.length > 0 ? '重新生成' : '生成分镜'}
          </button>
        )}
      </div>

      {/* 结果区 */}
      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {running && (
          <div className="text-xs text-on-surface-secondary p-3 bg-surface-primary rounded-lg border border-surface-border whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto">
            {rawOutput.slice(-500)}
            <span className="animate-pulse">▍</span>
          </div>
        )}

        {!running && shots.length > 0 && (
          <>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-on-surface">解析出 {shots.length} 个镜头</span>
              <span className="text-xs text-on-surface-secondary">
                总时长 {shots.reduce((s, x) => s + x.duration, 0)} 秒
              </span>
            </div>
            <div className="space-y-2">
              {shots.map((shot, i) => (
                <div key={i} className="p-2.5 bg-surface-primary rounded-lg border border-surface-border">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs px-1.5 py-0.5 rounded bg-surface-tertiary text-on-surface-secondary font-mono">#{i + 1}</span>
                    <span className="text-sm font-medium text-on-surface truncate">{shot.title}</span>
                  </div>
                  {shot.description && (
                    <p className="text-xs text-on-surface-secondary mb-1.5 line-clamp-2">{shot.description}</p>
                  )}
                  <div className="flex gap-1 flex-wrap">
                    <span className="text-xs px-1.5 py-0.5 rounded bg-surface-tertiary text-on-surface-secondary">{SHOT_LABELS[shot.shot_type]}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-surface-tertiary text-on-surface-secondary">{MOVE_LABELS[shot.camera_movement]}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-surface-tertiary text-on-surface-secondary">⏱️ {shot.duration}s</span>
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full mt-3 px-3 py-2 text-sm rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 transition-colors"
            >
              {saving ? '保存中…' : `保存 ${shots.length} 个分镜到本章`}
            </button>
          </>
        )}

        {!running && shots.length === 0 && parseFailed && (
          <p className="text-xs text-on-surface-secondary p-3 bg-surface-primary rounded-lg border border-surface-border">
            解析失败，可点击"重新生成"再试一次。
          </p>
        )}

        {!running && shots.length === 0 && !parseFailed && !rawOutput && (
          <div className="text-center text-on-surface-secondary py-10 px-4">
            <div className="text-3xl mb-3">🎬</div>
            <p className="text-sm">根据当前章节正文，一键生成分镜脚本</p>
            <p className="text-xs mt-2 leading-relaxed">
              AI 会分析章节内容的关键节拍，输出镜头标题、画面描述、景别、运镜与时长，保存后可在「导演」视图管理。
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
