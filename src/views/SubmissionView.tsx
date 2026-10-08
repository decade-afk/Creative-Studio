/**
 * 文件名：SubmissionView.tsx
 * 模块名称：投递视图
 *
 * 【核心功能】
 * 1. 平台投递卡：起点中文网 / 番茄小说
 *    - 打开作家后台（内嵌独立窗口，登录一次长期保留）
 *    - 自动填充：把当前章节的标题与正文注入后台编辑器（尽力而为，
 *      失败时剪贴板已备好，Ctrl+V 即可）
 * 2. 章节列表：每章标记两个平台的投递状态（已投 ✓）
 * 3. 投递台账：历史记录（章节/平台/时间），支持删除
 *
 * 【平台说明】
 * 两家平台均无公开投稿 API；内嵌窗口 + 表单填充是合规且稳定的路线
 * （不模拟登录、不绕过风控，用户真实登录，我们只做"自动填表"）。
 */

import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useWriterStore } from '../stores/writerStore';
import { useToast } from '../components/Toast';
import {
  SUBMISSION_PLATFORMS,
  formatChapterForSubmission,
  copyToClipboard,
  recordSubmission,
  getSubmissionsByWorkId,
  deleteSubmission,
  type SubmissionPlatform,
  type Submission,
} from '../services/submissionService';

/** 平台展示顺序 */
const PLATFORM_ORDER: SubmissionPlatform[] = ['qidian', 'fanqie'];

export default function SubmissionView() {
  const { showToast, ToastComponent } = useToast();
  const currentWorkId = useWriterStore((state) => state.currentWorkId);
  const chapters = useWriterStore((state) => state.chapters);

  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [selectedChapterId, setSelectedChapterId] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  const selectedChapter = chapters.find((c) => c.id === selectedChapterId);

  /** 加载投递历史 */
  const refresh = useCallback(async () => {
    if (!currentWorkId) return;
    try {
      setSubmissions(await getSubmissionsByWorkId(currentWorkId));
    } catch (error) {
      console.error('加载投递历史失败:', error);
    }
  }, [currentWorkId]);

  useEffect(() => {
    refresh();
    // 默认选中第一章
    if (!selectedChapterId && chapters.length > 0) {
      setSelectedChapterId(chapters[0].id);
    }
  }, [refresh, chapters, selectedChapterId]);

  /** 章节是否已投某平台 */
  const isSubmitted = (chapterId: string, platform: SubmissionPlatform) =>
    submissions.some((s) => s.chapter_id === chapterId && s.platform === platform);

  /** 准备投递文本（标题 + 空行 + 正文）并复制到剪贴板 */
  const prepareClipboard = async (): Promise<string | null> => {
    if (!selectedChapter) return null;
    const text = formatChapterForSubmission(selectedChapter.content || '');
    const ok = await copyToClipboard(text);
    if (!ok) {
      showToast('复制到剪贴板失败，请手动选择正文复制', 'error');
      return null;
    }
    return text;
  };

  /** 打开平台作家后台窗口 */
  const handleOpenConsole = useCallback(async (platform: SubmissionPlatform) => {
    try {
      await invoke('open_submission_window', { platform });
      showToast(`${SUBMISSION_PLATFORMS[platform].name}后台已打开，请在窗口中登录`, 'info');
    } catch (error: any) {
      showToast(error.message || String(error), 'error');
    }
  }, [showToast]);

  /** 自动填充当前章节到平台窗口 */
  const handleAutoFill = useCallback(async (platform: SubmissionPlatform) => {
    if (!selectedChapter) {
      showToast('请先选择章节', 'warning');
      return;
    }
    setBusy(true);
    try {
      // 剪贴板始终先备好（填充失败时的兜底）
      await prepareClipboard();
      const text = formatChapterForSubmission(selectedChapter.content || '');
      await invoke('fill_submission', {
        request: {
          platform,
          title: selectedChapter.title,
          content: text,
        },
      });
      showToast(
        `已尝试填充到${SUBMISSION_PLATFORMS[platform].name}（结果见后台窗口右上角提示），正文已同时复制到剪贴板`,
        'success'
      );
      // 记录投递
      if (currentWorkId) {
        await recordSubmission(currentWorkId, selectedChapter.id, selectedChapter.title, platform, '自动填充');
        await refresh();
      }
    } catch (error: any) {
      showToast(error.message || String(error), 'error');
    } finally {
      setBusy(false);
    }
  }, [selectedChapter, currentWorkId, refresh, showToast]);

  /** 复制投递（保底路径：复制 + 打开后台 + 记录） */
  const handleCopySubmit = useCallback(async (platform: SubmissionPlatform) => {
    if (!selectedChapter) {
      showToast('请先选择章节', 'warning');
      return;
    }
    setBusy(true);
    try {
      const ok = await prepareClipboard();
      if (!ok) return;
      await invoke('open_submission_window', { platform });
      if (currentWorkId) {
        await recordSubmission(currentWorkId, selectedChapter.id, selectedChapter.title, platform, '复制投递');
        await refresh();
      }
      showToast(`章节已复制并打开后台，在编辑器中 Ctrl+V 粘贴即可`, 'success');
    } catch (error: any) {
      showToast(error.message || String(error), 'error');
    } finally {
      setBusy(false);
    }
  }, [selectedChapter, currentWorkId, refresh, showToast]);

  const formatTime = (iso: string) => {
    const date = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T'));
    return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
  };

  return (
    <div className="flex-1 flex flex-col bg-surface-primary overflow-hidden">
      {ToastComponent}

      {/* 顶部：标题 + 使用指南 */}
      <div
        className="flex items-center justify-between px-6 py-4"
        style={{ borderBottom: '1px solid var(--outline-variant)', backgroundColor: 'var(--surface-secondary)' }}
      >
        <h2 className="text-lg font-semibold text-on-surface">📤 投递</h2>
        <button
          onClick={() => setShowGuide((v) => !v)}
          className="text-sm text-primary-600 hover:underline"
        >
          {showGuide ? '收起指南' : '使用指南'}
        </button>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* 使用指南 */}
          {showGuide && (
            <div className="p-4 bg-primary-50 border border-primary-200 rounded-lg text-sm text-on-surface-secondary space-y-2">
              <p className="font-medium text-on-surface">首次投递三步</p>
              <p>1. 点平台卡的「打开作家后台」，在弹出的窗口中登录（登录态会保留，下次免登录）</p>
              <p>2. 进入作品的「发布新章节 / 章节编辑」页面</p>
              <p>3. 回到本视图选中章节，点「自动填充」——标题和正文会填入后台编辑器；若后台改版导致填充失败，正文已在剪贴板，直接 Ctrl+V 即可</p>
              <p className="text-xs pt-1 border-t border-primary-200">
                说明：平台未提供官方投稿接口，本功能为「真实登录 + 自动填表」，不模拟登录、不绕过风控，符合平台使用协议。
              </p>
            </div>
          )}

          {/* 无作品提示 */}
          {!currentWorkId && (
            <div className="text-center py-12 text-on-surface-secondary">
              <div className="text-4xl mb-4">📤</div>
              <p>请先在创作视图中创建作品</p>
            </div>
          )}

          {currentWorkId && (
            <>
              {/* 平台卡 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {PLATFORM_ORDER.map((pid) => {
                  const platform = SUBMISSION_PLATFORMS[pid];
                  const count = submissions.filter((s) => s.platform === pid).length;
                  return (
                    <div key={pid} className="p-5 bg-surface-secondary rounded-xl border border-outline">
                      <div className="flex items-start justify-between gap-3 mb-1">
                        <div className="flex items-start gap-3 min-w-0">
                          <span className="text-3xl shrink-0">{platform.icon}</span>
                          <div className="min-w-0">
                            <h3 className="font-semibold text-on-surface">{platform.name}</h3>
                            <p className="text-xs text-on-surface-secondary break-words">{platform.hint}</p>
                          </div>
                        </div>
                        <span className="text-xs px-2 py-1 rounded bg-surface-primary text-on-surface-secondary whitespace-nowrap shrink-0">
                          已投 {count} 章
                        </span>
                      </div>
                      <button
                        onClick={() => handleOpenConsole(pid)}
                        className="mt-3 w-full px-3 py-2 text-sm rounded-lg border border-outline text-on-surface hover:bg-surface-tertiary transition-colors"
                      >
                        打开作家后台
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* 章节选择 + 投递操作 */}
              <div className="p-5 bg-surface-secondary rounded-xl border border-outline">
                <h3 className="font-semibold text-on-surface mb-3">选择章节投递</h3>
                {chapters.length === 0 ? (
                  <p className="text-sm text-on-surface-secondary py-4 text-center">当前作品还没有章节</p>
                ) : (
                  <>
                    <div className="max-h-52 overflow-y-auto border border-outline rounded-lg mb-4">
                      {chapters.map((chapter) => (
                        <button
                          key={chapter.id}
                          onClick={() => setSelectedChapterId(chapter.id)}
                          className={`w-full flex items-center justify-between px-3 py-2 text-left border-b border-outline last:border-0 transition-colors ${
                            selectedChapterId === chapter.id ? 'bg-primary-50 dark:bg-primary-950' : 'hover:bg-surface-tertiary'
                          }`}
                        >
                          <span className="text-sm text-on-surface truncate">{chapter.title}</span>
                          <span className="flex gap-1.5 shrink-0 ml-2">
                            {PLATFORM_ORDER.map((pid) => (
                              <span
                                key={pid}
                                className={`text-xs px-1.5 py-0.5 rounded ${
                                  isSubmitted(chapter.id, pid)
                                    ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                                    : 'bg-surface-primary text-on-surface-secondary opacity-50'
                                }`}
                              >
                                {SUBMISSION_PLATFORMS[pid].icon}
                                {isSubmitted(chapter.id, pid) ? '✓' : ''}
                              </span>
                            ))}
                          </span>
                        </button>
                      ))}
                    </div>

                    {/* 操作栏 */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {PLATFORM_ORDER.map((pid) => (
                        <div key={pid} className="flex gap-2">
                          <button
                            onClick={() => handleCopySubmit(pid)}
                            disabled={!selectedChapter || busy}
                            className="flex-1 px-3 py-2 text-sm rounded-lg border border-outline text-on-surface hover:bg-surface-tertiary disabled:opacity-50 transition-colors"
                            title="格式化章节复制到剪贴板并打开后台"
                          >
                            📋 复制投递
                          </button>
                          <button
                            onClick={() => handleAutoFill(pid)}
                            disabled={!selectedChapter || busy}
                            className="flex-1 px-3 py-2 text-sm rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 transition-colors"
                            title="在后台窗口中自动填充标题与正文（需先打开后台）"
                          >
                            ✨ 自动填充
                          </button>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* 投递历史 */}
              <div className="p-5 bg-surface-secondary rounded-xl border border-outline">
                <h3 className="font-semibold text-on-surface mb-3">投递历史</h3>
                {submissions.length === 0 ? (
                  <p className="text-sm text-on-surface-secondary py-4 text-center">暂无投递记录</p>
                ) : (
                  <div className="max-h-64 overflow-y-auto">
                    {submissions.map((s) => (
                      <div key={s.id} className="flex items-center justify-between px-3 py-2 border-b border-outline last:border-0">
                        <div className="min-w-0">
                          <p className="text-sm text-on-surface truncate">
                            {SUBMISSION_PLATFORMS[s.platform]?.icon} {s.chapter_title}
                            <span className="ml-2 text-xs text-on-surface-secondary">
                              → {SUBMISSION_PLATFORMS[s.platform]?.name} · {s.note} · {formatTime(s.created_at)}
                            </span>
                          </p>
                        </div>
                        <button
                          onClick={async () => {
                            await deleteSubmission(s.id);
                            await refresh();
                          }}
                          className="p-1.5 text-red-500 hover:bg-red-50 rounded transition-colors text-sm shrink-0 ml-2"
                          title="删除记录"
                        >
                          🗑️
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
