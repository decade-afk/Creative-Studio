/**
 * 文件名：VersionsDialog.tsx
 * 模块名称：章节版本历史对话框
 *
 * 【核心功能】
 * 1. 列出当前章节的所有版本快照（时间 / 字数 / 说明）
 * 2. 手动保存版本、预览差异（字数对比）、恢复到指定版本
 * 3. 恢复前自动保存当前内容为"恢复前"版本（在 chapterService 内实现）
 */

import { useState, useEffect, useCallback } from 'react';
import {
  listChapterVersions,
  restoreChapterVersion,
  saveChapterVersion,
  deleteChapterVersion,
  type ChapterVersion,
} from '../services/chapterService';
import { useWriterStore } from '../stores/writerStore';
import { useToast } from './Toast';

interface VersionsDialogProps {
  /** 关闭对话框 */
  onClose: () => void;
  /** 恢复成功后的回调（刷新编辑器内容） */
  onRestored: (content: string) => void;
}

/** 版本元信息（不含内容） */
type VersionMeta = Omit<ChapterVersion, 'content'>;

/**
 * 章节版本历史对话框
 */
export default function VersionsDialog({ onClose, onRestored }: VersionsDialogProps) {
  const { showToast } = useToast();
  const currentChapterId = useWriterStore((state) => state.currentChapterId);
  const currentChapterIdRef = currentChapterId;

  const [versions, setVersions] = useState<VersionMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  /** 加载版本列表 */
  const refresh = useCallback(async () => {
    if (!currentChapterIdRef) return;
    setLoading(true);
    try {
      setVersions(await listChapterVersions(currentChapterIdRef));
    } catch (error) {
      console.error('加载版本失败:', error);
    } finally {
      setLoading(false);
    }
  }, [currentChapterIdRef]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  /** 手动保存版本 */
  const handleSave = async () => {
    if (!currentChapterId) return;
    setSaving(true);
    try {
      await saveChapterVersion(currentChapterId, '手动保存');
      showToast('版本已保存', 'success');
      await refresh();
    } catch (error: any) {
      showToast(error.message || '保存失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  /** 恢复版本 */
  const handleRestore = async (version: VersionMeta) => {
    const confirmed = window.confirm(
      `确定恢复到 ${new Date(version.created_at).toLocaleString()} 的版本吗？\n当前内容会先自动保存为「恢复前」版本。`
    );
    if (!confirmed) return;

    setRestoringId(version.id);
    try {
      const chapter = await restoreChapterVersion(version.id);
      showToast('版本已恢复', 'success');
      onRestored(chapter.content);
      onClose();
    } catch (error: any) {
      showToast(error.message || '恢复失败', 'error');
    } finally {
      setRestoringId(null);
    }
  };

  /** 删除版本 */
  const handleDelete = async (version: VersionMeta) => {
    const confirmed = window.confirm('确定删除这个版本吗？');
    if (!confirmed) return;
    try {
      await deleteChapterVersion(version.id);
      await refresh();
    } catch (error: any) {
      showToast(error.message || '删除失败', 'error');
    }
  };

  const formatTime = (iso: string) => {
    const date = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T'));
    return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-[520px] max-h-[70vh] bg-surface-primary rounded-xl shadow-2xl border border-surface-border flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border">
          <h3 className="text-sm font-semibold text-on-surface">版本历史</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={saving || !currentChapterId}
              className="px-3 py-1 text-xs rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
            >
              {saving ? '保存中…' : '保存当前版本'}
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-surface-tertiary text-on-surface-secondary"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* 版本列表 */}
        <div className="flex-1 overflow-y-auto">
          {loading && <p className="text-center text-sm text-on-surface-secondary py-8">加载中…</p>}

          {!loading && versions.length === 0 && (
            <p className="text-center text-sm text-on-surface-secondary py-8">
              还没有版本快照。重大修改前点击「保存当前版本」，AI 改写与恢复操作也会自动创建快照。
            </p>
          )}

          {versions.map((version) => (
            <div
              key={version.id}
              className="flex items-center justify-between px-4 py-2.5 border-b border-surface-border last:border-0"
            >
              <div className="min-w-0">
                <p className="text-sm text-on-surface">
                  {formatTime(version.created_at)}
                  {version.label && (
                    <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-surface-tertiary text-on-surface-secondary">
                      {version.label}
                    </span>
                  )}
                </p>
                <p className="text-xs text-on-surface-secondary">{version.word_count} 字</p>
              </div>
              <div className="flex items-center gap-2 ml-4 shrink-0">
                <button
                  onClick={() => handleRestore(version)}
                  disabled={restoringId !== null}
                  className="px-2.5 py-1 text-xs rounded-md border border-primary-300 text-primary-600 hover:bg-primary-50 disabled:opacity-50"
                >
                  {restoringId === version.id ? '恢复中…' : '恢复'}
                </button>
                <button
                  onClick={() => handleDelete(version)}
                  disabled={restoringId !== null}
                  className="px-2.5 py-1 text-xs rounded-md border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
