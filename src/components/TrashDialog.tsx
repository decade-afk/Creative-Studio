/**
 * 文件名：TrashDialog.tsx
 * 模块名称：回收站对话框
 *
 * 【核心功能】
 * 1. 列出已删除的作品与章节（全库软删除，此处统一找回）
 * 2. 恢复：作品/章节撤销软删除标记，回到原视图
 * 3. 彻底删除：物理删除（含章节版本快照），二次确认
 *
 * 【数据说明】
 * - 恢复作品会同时恢复其下已删除的章节（级联软删除的逆操作）
 */

import { useState, useEffect, useCallback } from 'react';
import type { Work, Chapter } from '../types/storage';
import { getDeletedWorks, restoreWork, permanentlyDeleteWork } from '../services/workService';
import {
  getAllDeletedChapters,
  restoreChapter,
  permanentlyDeleteChapter,
} from '../services/chapterService';
import { useToast } from './Toast';
import ConfirmDialog from './ConfirmDialog';

interface TrashDialogProps {
  onClose: () => void;
  /** 恢复/删除后通知外部刷新数据（如侧边栏作品列表） */
  onChanged?: () => void;
}

export default function TrashDialog({ onClose, onChanged }: TrashDialogProps) {
  const { showToast } = useToast();
  const [works, setWorks] = useState<Work[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [purging, setPurging] = useState<{ type: 'work' | 'chapter'; id: string; title: string } | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [deletedWorks, deletedChapters] = await Promise.all([
        getDeletedWorks(),
        getAllDeletedChapters(),
      ]);
      // 只展示所属作品未被删除的章节（作品级恢复会连带找回其章节）
      const deletedWorkIds = new Set(deletedWorks.map((w) => w.id));
      setWorks(deletedWorks);
      setChapters(deletedChapters.filter((c) => !deletedWorkIds.has(c.work_id)));
    } catch (error) {
      console.error('加载回收站失败:', error);
      showToast('加载回收站失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  /** 恢复作品（连同其已删除章节） */
  const handleRestoreWork = useCallback(async (work: Work) => {
    try {
      await restoreWork(work.id);
      // 级联恢复该作品下已删除的章节
      const deleted = await getAllDeletedChapters();
      for (const ch of deleted) {
        if (ch.work_id === work.id) {
          await restoreChapter(ch.id);
        }
      }
      showToast(`作品「${work.title}」已恢复`, 'success');
      onChanged?.();
      await refresh();
    } catch (error: any) {
      showToast(error.message || '恢复失败', 'error');
    }
  }, [showToast, onChanged, refresh]);

  /** 恢复章节 */
  const handleRestoreChapter = useCallback(async (chapter: Chapter) => {
    try {
      await restoreChapter(chapter.id);
      showToast(`章节「${chapter.title}」已恢复`, 'success');
      onChanged?.();
      await refresh();
    } catch (error: any) {
      showToast(error.message || '恢复失败', 'error');
    }
  }, [showToast, onChanged, refresh]);

  /** 确认彻底删除 */
  const handleConfirmPurge = useCallback(async () => {
    if (!purging) return;
    try {
      if (purging.type === 'work') {
        await permanentlyDeleteWork(purging.id);
      } else {
        await permanentlyDeleteChapter(purging.id);
      }
      showToast(`「${purging.title}」已彻底删除`, 'success');
      onChanged?.();
      setPurging(null);
      await refresh();
    } catch (error: any) {
      showToast(error.message || '删除失败', 'error');
      setPurging(null);
    }
  }, [purging, showToast, onChanged, refresh]);

  const formatTime = (iso: string) => {
    const date = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T'));
    return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[9999]" onClick={onClose}>
      <div
        className="w-[560px] max-h-[70vh] bg-surface-primary rounded-xl shadow-2xl border border-surface-border flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {purging && (
          <ConfirmDialog
            title="彻底删除"
            message={`确定要彻底删除「${purging.title}」吗？数据将被永久清除，无法恢复。`}
            confirmText="彻底删除"
            cancelText="取消"
            type="danger"
            onConfirm={handleConfirmPurge}
            onCancel={() => setPurging(null)}
          />
        )}

        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border">
          <h3 className="text-sm font-semibold text-on-surface">🗑️ 回收站</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-surface-tertiary text-on-surface-secondary">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading && <p className="text-center text-sm text-on-surface-secondary py-8">加载中…</p>}

          {!loading && works.length === 0 && chapters.length === 0 && (
            <p className="text-center text-sm text-on-surface-secondary py-8">
              回收站是空的。删除的作品和章节会在这里等你找回。
            </p>
          )}

          {/* 已删除作品 */}
          {works.length > 0 && (
            <div>
              <div className="px-4 pt-3 pb-1 text-xs font-medium text-on-surface-secondary">作品（{works.length}）</div>
              {works.map((work) => (
                <div key={work.id} className="flex items-center justify-between px-4 py-2.5 border-b border-surface-border">
                  <div className="min-w-0">
                    <p className="text-sm text-on-surface truncate">{work.icon} {work.title}</p>
                    <p className="text-xs text-on-surface-secondary">删除于 {formatTime(work.updated_at)}</p>
                  </div>
                  <div className="flex gap-2 ml-3 shrink-0">
                    <button
                      onClick={() => handleRestoreWork(work)}
                      className="px-2.5 py-1 text-xs rounded-md border border-primary-300 text-primary-600 hover:bg-primary-50"
                    >
                      恢复
                    </button>
                    <button
                      onClick={() => setPurging({ type: 'work', id: work.id, title: work.title })}
                      className="px-2.5 py-1 text-xs rounded-md border border-red-300 text-red-600 hover:bg-red-50"
                    >
                      彻底删除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 已删除章节 */}
          {chapters.length > 0 && (
            <div>
              <div className="px-4 pt-3 pb-1 text-xs font-medium text-on-surface-secondary">章节（{chapters.length}）</div>
              {chapters.map((chapter) => (
                <div key={chapter.id} className="flex items-center justify-between px-4 py-2.5 border-b border-surface-border last:border-0">
                  <div className="min-w-0">
                    <p className="text-sm text-on-surface truncate">📖 {chapter.title}</p>
                    <p className="text-xs text-on-surface-secondary">删除于 {formatTime(chapter.updated_at)}</p>
                  </div>
                  <div className="flex gap-2 ml-3 shrink-0">
                    <button
                      onClick={() => handleRestoreChapter(chapter)}
                      className="px-2.5 py-1 text-xs rounded-md border border-primary-300 text-primary-600 hover:bg-primary-50"
                    >
                      恢复
                    </button>
                    <button
                      onClick={() => setPurging({ type: 'chapter', id: chapter.id, title: chapter.title })}
                      className="px-2.5 py-1 text-xs rounded-md border border-red-300 text-red-600 hover:bg-red-50"
                    >
                      彻底删除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-4 py-2 border-t border-surface-border text-xs text-on-surface-secondary">
          恢复作品会连带恢复其下已删除的章节；彻底删除将清除数据（含版本快照），不可撤销
        </div>
      </div>
    </div>
  );
}
