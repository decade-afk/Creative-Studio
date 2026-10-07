/**
 * DirectorView - 导演视图组件（完整重构版本）
 *
 * 【核心功能】
 * 1. 伏笔追踪系统（Clues）- 剧情伏笔管理
 *    - 伏笔来源：手动添加 / AI自动检测
 *    - 伏笔状态：未铺陈 / 已铺陈 / 已回收 / 已废弃
 *    - 伏笔描述和追踪
 *    - 支持编辑和删除
 *
 * 2. 冲突矩阵管理（Conflicts）- 戏剧冲突分析
 *    - 冲突类型：人物冲突 / 内心冲突 / 环境冲突 / 价值观冲突
 *    - 冲突强度：低 / 中 / 高 / 极高
 *    - 冲突状态：潜在 / 激化 / 高潮 / 解决 / 遗留
 *    - 涉及角色列表
 *    - 冲突描述和解决方案
 *
 * 3. 分镜时间线（Storyboards）- 镜头设计
 *    - 镜头类型：特写 / 近景/中景/远景/全景/大全景
 *    - 运镜方式：固定 / 推拉/摇移/跟随/升降/环绕/手持
 *    - 镜头时长（秒）
 *    - 分镜描述
 *    - 顺序号显示（font-mono）
 *
 * 4. 素材库管理（Assets）- 创作素材收集
 *    - 素材类型：图片 / 视频/音频/文档/参考/其他
 *    - 素材标签（支持多标签，逗号分隔）
 *    - 网格式布局展示
 *    - 类型图标可视化
 *
 * 【技术亮点】
 * - 性能优化：reloadCurrentTab 只加载当前标签数据
 * - 多状态展示：冲突矩阵支持多个状态徽章（类型+强度+状态）
 * - 可视化设计：分镜带顺序号，素材带类型图标
 * - 统一表单：编辑对话框根据类型动态渲染不同表单
 * - 完整 CRUD：所有模块都支持创建、编辑、删除
 *
 * 【状态管理】
 * - 数据状态：clues, conflicts, storyboards, assets
 * - 当前选中：currentWorkId, currentTab
 * - 编辑状态：editingItem（类型 + 数据）
 * - 删除状态：deletingId
 * - UI 状态：loading
 *
 * 【数据流】
 * 1. 加载所有数据 → 从本地存储 → state
 * 2. 切换标签 → 切换显示，不重新加载
 * 3. CRUD 操作 → 只重新加载当前标签数据
 *
 * 【UI 特色】
 * - 伏笔：来源徽章（手动/AI）+ 状态徽章
 * - 冲突：三个徽章并排（类型、强度、状态）+ 角色列表
 * - 分镜：顺序号（font-mono）+ 镜头类型 + 运镜方式 + 时长
 * - 素材：网格布局 + 类型图标 + 标签展示
 *
 * 【注意事项】
 * 1. 素材标签使用逗号分隔，输入时自动处理
 * 2. 冲突可以关联多个角色（逗号分隔）
 * 3. 分镜按 order 字段排序显示
 * 4. 所有删除操作都需要二次确认
 */

import { useState, useEffect, useCallback } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import type { Clue, Conflict, Storyboard, Asset } from '../types/storage';
import type { Work } from '../types/storage';
import { getCluesByWorkId, createClue, updateClue, deleteClue } from '../services/clueService';
import { getConflictsByWorkId, createConflict, updateConflict, deleteConflict } from '../services/conflictService';
import { getStoryboardsByWorkId, createStoryboard, updateStoryboard, deleteStoryboard } from '../services/storyboardService';
import { getAssetsByWorkId, updateAsset, deleteAsset } from '../services/assetService';
import { getScenesByWorkId } from '../services/sceneService';
import { getChaptersByWorkId } from '../services/chapterService';
import {
  importAssetWithDialog,
  importAssetsWithDialog,
  removeAsset,
  formatFileSize,
} from '../services/fileStorageService';
import { getWorks } from '../services/workService';
import { useWriterStore } from '../stores/writerStore';
import { useToast } from '../components/Toast';
import ConfirmDialog from '../components/ConfirmDialog';

type Tab = 'clues' | 'conflicts' | 'storyboards' | 'assets';

type EditingItem = {
  type: Tab;
  item: Clue | Conflict | Storyboard | Asset;
} | null;

export default function DirectorView() {
  const [currentWorkId, setCurrentWorkId] = useState<string>('');
  const [works, setWorks] = useState<Work[]>([]);
  const [currentTab, setCurrentTab] = useState<Tab>('clues');
  const [loading, setLoading] = useState(false);

  // 数据状态
  const [clues, setClues] = useState<Clue[]>([]);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [storyboards, setStoryboards] = useState<Storyboard[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [scenes, setScenes] = useState<{ id: string; name: string }[]>([]);
  const [chapters, setChapters] = useState<{ id: string; title: string }[]>([]);

  // UI 状态
  const [editingItem, setEditingItem] = useState<EditingItem>(null);
  const [deletingItem, setDeletingItem] = useState<{ id: string; title: string } | null>(null);
  const { showToast, ToastComponent } = useToast();

  // 与全局当前作品保持一致
  useEffect(() => {
    async function loadWork() {
      const loadedWorks = await getWorks();
      setWorks(loadedWorks);
      const storeId = useWriterStore.getState().currentWorkId;
      if (storeId && loadedWorks.some((w) => w.id === storeId)) {
        setCurrentWorkId(storeId);
      } else if (loadedWorks.length > 0) {
        setCurrentWorkId(loadedWorks[0].id);
      }
    }
    loadWork();
  }, []);

  /** 切换作品：同步全局 store */
  const handleWorkChange = useCallback((workId: string) => {
    setCurrentWorkId(workId);
    useWriterStore.getState().setCurrentWorkId(workId);
  }, []);

  // 加载数据
  useEffect(() => {
    if (!currentWorkId) return;
    loadAllData();
  }, [currentWorkId]);

  // 加载所有数据（含关联用的章节与场景列表）
  const loadAllData = useCallback(async () => {
    if (!currentWorkId) return;

    setLoading(true);
    try {
      const [cluesData, conflictsData, storyboardsData, assetsData, scenesData, chaptersData] =
        await Promise.all([
          getCluesByWorkId(currentWorkId),
          getConflictsByWorkId(currentWorkId),
          getStoryboardsByWorkId(currentWorkId),
          getAssetsByWorkId(currentWorkId),
          getScenesByWorkId(currentWorkId),
          getChaptersByWorkId(currentWorkId),
        ]);

      setClues(cluesData);
      setConflicts(conflictsData);
      setStoryboards(storyboardsData);
      setAssets(assetsData);
      setScenes(scenesData.map((s) => ({ id: s.id, name: s.name })));
      setChapters(chaptersData.map((c) => ({ id: c.id, title: c.title })));
    } catch (error) {
      showToast('加载数据失败', 'error');
      console.error('加载失败:', error);
    } finally {
      setLoading(false);
    }
  }, [currentWorkId, showToast]);

  // 性能优化：只重新加载当前tab的数据
  const reloadCurrentTab = useCallback(async () => {
    if (!currentWorkId) return;

    setLoading(true);
    try {
      switch (currentTab) {
        case 'clues':
          setClues(await getCluesByWorkId(currentWorkId));
          break;
        case 'conflicts':
          setConflicts(await getConflictsByWorkId(currentWorkId));
          break;
        case 'storyboards':
          setStoryboards(await getStoryboardsByWorkId(currentWorkId));
          break;
        case 'assets':
          setAssets(await getAssetsByWorkId(currentWorkId));
          break;
      }
    } catch (error) {
      showToast('重新加载失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [currentWorkId, currentTab, showToast]);

  // 快速创建项
  const handleQuickCreate = useCallback(async () => {
    if (!currentWorkId || loading) return;

    setLoading(true);
    try {
      switch (currentTab) {
        case 'clues':
          await createClue({
            work_id: currentWorkId,
            name: '新伏笔',
            source: 'manual',
            status: 'open',
            setup_scene_id: null,
            payoff_scene_id: null,
            description: '',
          });
          showToast('伏笔创建成功', 'success');
          break;

        case 'conflicts':
          await createConflict({
            work_id: currentWorkId,
            name: '新冲突',
            type: 'character',
            intensity: 'medium',
            characters: '',
            scene_id: null,
            description: '',
            resolution: '',
            status: 'active',
          });
          showToast('冲突创建成功', 'success');
          break;

        case 'storyboards':
          await createStoryboard({
            work_id: currentWorkId,
            chapter_id: null,
            scene_id: null,
            title: '新分镜',
            description: '',
            shot_type: 'medium',
            camera_movement: 'static',
            duration: 0,
            order: storyboards.length,
          });
          showToast('分镜创建成功', 'success');
          break;

        case 'assets': {
          // 素材：走真实文件导入（对话框选择 → 复制进应用数据目录 → 建库记录）
          const imported = await importAssetWithDialog(currentWorkId);
          if (imported) {
            showToast(`素材已导入：${imported.name}`, 'success');
          } else {
            return; // 用户取消，不提示错误
          }
          break;
        }
      }

      await reloadCurrentTab();
    } catch (error) {
      showToast('创建失败', 'error');
      console.error('创建失败:', error);
    } finally {
      setLoading(false);
    }
  }, [currentWorkId, currentTab, loading, storyboards.length, reloadCurrentTab, showToast]);

  // 保存编辑
  const handleSaveEdit = useCallback(async (item: Clue | Conflict | Storyboard | Asset) => {
    if (!editingItem) return;

    setLoading(true);
    try {
      switch (editingItem.type) {
        case 'clues': {
          const clue = item as Clue;
          await updateClue(clue.id, {
            name: clue.name,
            source: clue.source,
            status: clue.status,
            setup_scene_id: clue.setup_scene_id,
            payoff_scene_id: clue.payoff_scene_id,
            description: clue.description,
          });
          showToast('伏笔更新成功', 'success');
          break;
        }
        case 'conflicts': {
          const conflict = item as Conflict;
          await updateConflict(conflict.id, {
            name: conflict.name,
            type: conflict.type,
            intensity: conflict.intensity,
            characters: conflict.characters,
            description: conflict.description,
            resolution: conflict.resolution,
            status: conflict.status,
          });
          showToast('冲突更新成功', 'success');
          break;
        }
        case 'storyboards': {
          const board = item as Storyboard;
          await updateStoryboard(board.id, {
            chapter_id: board.chapter_id,
            scene_id: board.scene_id,
            title: board.title,
            description: board.description,
            shot_type: board.shot_type,
            camera_movement: board.camera_movement,
            duration: board.duration,
          });
          showToast('分镜更新成功', 'success');
          break;
        }
        case 'assets': {
          const asset = item as Asset;
          await updateAsset(asset.id, {
            name: asset.name,
            type: asset.type,
            tags: asset.tags,
          });
          showToast('素材更新成功', 'success');
          break;
        }
      }

      setEditingItem(null);
      await reloadCurrentTab();
    } catch (error) {
      showToast('更新失败', 'error');
      console.error('更新失败:', error);
    } finally {
      setLoading(false);
    }
  }, [editingItem, reloadCurrentTab, showToast]);

  // 确认删除
  const handleConfirmDelete = useCallback(async () => {
    if (!deletingItem) return;

    setLoading(true);
    try {
      switch (currentTab) {
        case 'clues':
          await deleteClue(deletingItem.id);
          showToast('伏笔已删除', 'success');
          break;
        case 'conflicts':
          await deleteConflict(deletingItem.id);
          showToast('冲突已删除', 'success');
          break;
        case 'storyboards':
          await deleteStoryboard(deletingItem.id);
          showToast('分镜已删除', 'success');
          break;
        case 'assets': {
          // 素材：连同物理文件一起删除
          const asset = assets.find((a) => a.id === deletingItem.id);
          if (asset) {
            await removeAsset(asset);
            showToast('素材已删除（含文件）', 'success');
          } else {
            await deleteAsset(deletingItem.id);
          }
          break;
        }
      }

      setDeletingItem(null);
      await reloadCurrentTab();
    } catch (error) {
      showToast('删除失败', 'error');
      console.error('删除失败:', error);
    } finally {
      setLoading(false);
    }
  }, [deletingItem, currentTab, assets, reloadCurrentTab, showToast]);

  /** 批量导入素材（多选文件，单个失败不中断） */
  const handleBatchImport = useCallback(async () => {
    if (!currentWorkId || loading) return;
    setLoading(true);
    try {
      const { imported, failed } = await importAssetsWithDialog(currentWorkId);
      if (imported.length > 0) {
        showToast(
          `成功导入 ${imported.length} 个素材${failed.length > 0 ? `，${failed.length} 个失败` : ''}`,
          failed.length > 0 ? 'warning' : 'success'
        );
        await reloadCurrentTab();
      } else if (failed.length > 0) {
        showToast(`全部导入失败：${failed[0]}`, 'error');
      }
    } catch (error: any) {
      showToast(error.message || '批量导入失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [currentWorkId, loading, reloadCurrentTab, showToast]);

  /** 在系统文件管理器中显示素材文件 */
  const handleRevealAsset = useCallback(async (asset: Asset) => {
    try {
      await revealItemInDir(asset.file_path);
    } catch (error) {
      showToast('打开文件夹失败', 'error');
      console.error(error);
    }
  }, [showToast]);

  /** 分镜同级排序 */
  const handleMoveStoryboard = useCallback(async (board: Storyboard, direction: -1 | 1) => {
    const sorted = [...storyboards].sort((a, b) => a.order - b.order);
    const index = sorted.findIndex((s) => s.id === board.id);
    const target = sorted[index + direction];
    if (!target) return;
    try {
      await updateStoryboard(board.id, { order: target.order });
      await updateStoryboard(target.id, { order: board.order });
      await reloadCurrentTab();
    } catch (error) {
      showToast('排序失败', 'error');
      console.error(error);
    }
  }, [storyboards, reloadCurrentTab, showToast]);

  return (
    <div className="flex-1 flex flex-col bg-surface-primary overflow-hidden">
      {ToastComponent}

      {/* 确认删除对话框 */}
      {deletingItem && (
        <ConfirmDialog
          title="确认删除"
          message={`确定要删除「${deletingItem.title}」吗？${currentTab === 'assets' ? '对应文件也将一并删除，' : ''}此操作无法撤销。`}
          confirmText="删除"
          cancelText="取消"
          type="danger"
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeletingItem(null)}
        />
      )}

      {/* 顶部导航 */}
      <div
        className="flex items-center justify-between px-6 py-4"
        style={{
          borderBottom: '1px solid var(--outline-variant)',
          backgroundColor: 'var(--surface-secondary)',
        }}
      >
        <div className="flex items-center gap-3">
          <select
            value={currentWorkId}
            onChange={(e) => handleWorkChange(e.target.value)}
            className="px-3 py-2 rounded-lg text-sm font-medium bg-surface-primary text-on-surface border border-outline focus:outline-none focus:ring-2 focus:ring-primary-500 max-w-[180px]"
            title="切换作品"
          >
            {works.length === 0 && <option value="">暂无作品</option>}
            {works.map((w) => (
              <option key={w.id} value={w.id}>{w.icon} {w.title}</option>
            ))}
          </select>
          <div className="flex gap-2">
            <button
              onClick={() => setCurrentTab('clues')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                currentTab === 'clues'
                  ? 'bg-primary-500 text-white'
                  : 'text-on-surface-variant hover:bg-on-surface-secondary/10'
              }`}
            >
              🔗 伏笔
            </button>
          <button
            onClick={() => setCurrentTab('conflicts')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              currentTab === 'conflicts'
                ? 'bg-primary-500 text-white'
                : 'text-on-surface-variant hover:bg-on-surface-secondary/10'
            }`}
          >
            ⚔️ 冲突
          </button>
          <button
            onClick={() => setCurrentTab('storyboards')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              currentTab === 'storyboards'
                ? 'bg-primary-500 text-white'
                : 'text-on-surface-variant hover:bg-on-surface-secondary/10'
            }`}
          >
            📹 分镜
          </button>
          <button
            onClick={() => setCurrentTab('assets')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              currentTab === 'assets'
                ? 'bg-primary-500 text-white'
                : 'text-on-surface-variant hover:bg-on-surface-secondary/10'
            }`}
          >
            📦 素材
          </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {currentTab === 'assets' && (
            <button
              onClick={handleBatchImport}
              disabled={loading || !currentWorkId}
              className="px-4 py-2 border border-primary-400 text-primary-600 rounded-lg text-sm font-medium hover:bg-primary-50 transition-colors disabled:opacity-50"
              title="一次选择多个文件导入"
            >
              ⏫ 批量导入
            </button>
          )}
          <button
            onClick={handleQuickCreate}
            disabled={loading || !currentWorkId}
            className="px-4 py-2 bg-primary-500 text-white rounded-lg text-sm font-medium hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? '处理中...' : currentTab === 'assets' ? '+ 导入素材' : '+ 新建'}
          </button>
        </div>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-auto p-6">
        {loading && (
          <div className="flex items-center justify-center h-32">
            <div className="text-on-surface-secondary">加载中...</div>
          </div>
        )}

        {!loading && currentTab === 'clues' && (
          <CluesView
            clues={clues}
            scenes={scenes}
            onEdit={(item) => setEditingItem({ type: 'clues', item })}
            onDelete={(id) => {
              const c = clues.find((x) => x.id === id);
              setDeletingItem({ id, title: c?.name || '伏笔' });
            }}
          />
        )}

        {!loading && currentTab === 'conflicts' && (
          <ConflictsView
            conflicts={conflicts}
            onEdit={(item) => setEditingItem({ type: 'conflicts', item })}
            onDelete={(id) => {
              const c = conflicts.find((x) => x.id === id);
              setDeletingItem({ id, title: c?.name || '冲突' });
            }}
          />
        )}

        {!loading && currentTab === 'storyboards' && (
          <StoryboardsView
            storyboards={storyboards}
            chapters={chapters}
            onEdit={(item) => setEditingItem({ type: 'storyboards', item })}
            onDelete={(id) => {
              const s = storyboards.find((x) => x.id === id);
              setDeletingItem({ id, title: s?.title || '分镜' });
            }}
            onMove={handleMoveStoryboard}
          />
        )}

        {!loading && currentTab === 'assets' && (
          <AssetsView
            assets={assets}
            onEdit={(item) => setEditingItem({ type: 'assets', item })}
            onDelete={(id) => {
              const a = assets.find((x) => x.id === id);
              setDeletingItem({ id, title: a?.name || '素材' });
            }}
            onReveal={handleRevealAsset}
          />
        )}

        {!currentWorkId && !loading && (
          <div className="flex items-center justify-center h-full text-on-surface-secondary">
            <div className="text-center">
              <p>请先创建作品</p>
              <p className="text-sm mt-2">切换到创作视图创建您的第一个作品</p>
            </div>
          </div>
        )}
      </div>

      {/* 编辑对话框 */}
      {editingItem && (
        <EditDialog
          item={editingItem.item}
          type={editingItem.type}
          scenes={scenes}
          chapters={chapters}
          onSave={handleSaveEdit}
          onCancel={() => setEditingItem(null)}
        />
      )}
    </div>
  );
}

// 编辑对话框组件
function EditDialog({
  item,
  type,
  scenes,
  chapters,
  onSave,
  onCancel,
}: {
  item: Clue | Conflict | Storyboard | Asset;
  type: Tab;
  scenes: { id: string; name: string }[];
  chapters: { id: string; title: string }[];
  onSave: (item: Clue | Conflict | Storyboard | Asset) => void;
  onCancel: () => void;
}) {
  const [editedItem, setEditedItem] = useState(item);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(editedItem);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]">
      <div className="bg-surface-primary rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <div className="px-6 py-4 border-b border-outline sticky top-0 bg-surface-primary">
            <h3 className="text-lg font-semibold text-on-surface">
              编辑{type === 'clues' ? '伏笔' : type === 'conflicts' ? '冲突' : type === 'storyboards' ? '分镜' : '素材'}
            </h3>
          </div>

          <div className="px-6 py-4 space-y-4">
            {type === 'clues' && (
              <ClueForm
                clue={editedItem as Clue}
                scenes={scenes}
                onChange={(updated) => setEditedItem(updated)}
              />
            )}
            {type === 'conflicts' && (
              <ConflictForm
                conflict={editedItem as Conflict}
                onChange={(updated) => setEditedItem(updated)}
              />
            )}
            {type === 'storyboards' && (
              <StoryboardForm
                storyboard={editedItem as Storyboard}
                chapters={chapters}
                scenes={scenes}
                onChange={(updated) => setEditedItem(updated)}
              />
            )}
            {type === 'assets' && (
              <AssetForm
                asset={editedItem as Asset}
                onChange={(updated) => setEditedItem(updated)}
              />
            )}
          </div>

          <div className="px-6 py-4 border-t border-outline flex justify-end gap-3 sticky bottom-0 bg-surface-primary">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 rounded-lg text-sm font-medium text-on-surface-variant hover:bg-surface-primary transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg text-sm font-medium bg-primary-500 text-white hover:bg-primary-600 transition-colors"
            >
              保存
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// 伏笔编辑表单（含铺设/回收场景关联）
function ClueForm({
  clue,
  scenes,
  onChange,
}: {
  clue: Clue;
  scenes: { id: string; name: string }[];
  onChange: (clue: Clue) => void;
}) {
  return (
    <>
      <div>
        <label className="block text-sm font-medium text-on-surface-variant mb-2">名称</label>
        <input
          type="text"
          value={clue.name}
          onChange={(e) => onChange({ ...clue, name: e.target.value })}
          className="w-full px-3 py-2 border border-outline rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          placeholder="输入伏笔名称"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-on-surface-variant mb-2">来源</label>
        <select
          value={clue.source}
          onChange={(e) => onChange({ ...clue, source: e.target.value as Clue['source'] })}
          className="w-full px-3 py-2 border border-outline rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="manual">手动标记</option>
          <option value="ai_detected">AI检测</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-on-surface-variant mb-2">状态</label>
        <select
          value={clue.status}
          onChange={(e) => onChange({ ...clue, status: e.target.value as Clue['status'] })}
          className="w-full px-3 py-2 border border-outline rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="open">未解决</option>
          <option value="resolved">已解决</option>
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-on-surface-variant mb-2">铺设场景（埋下伏笔）</label>
          <select
            value={clue.setup_scene_id || ''}
            onChange={(e) => onChange({ ...clue, setup_scene_id: e.target.value || null })}
            className="w-full px-3 py-2 border border-outline rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">未关联</option>
            {scenes.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-on-surface-variant mb-2">回收场景（揭示真相）</label>
          <select
            value={clue.payoff_scene_id || ''}
            onChange={(e) => onChange({ ...clue, payoff_scene_id: e.target.value || null })}
            className="w-full px-3 py-2 border border-outline rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">未关联</option>
            {scenes.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-on-surface-variant mb-2">描述</label>
        <textarea
          value={clue.description}
          onChange={(e) => onChange({ ...clue, description: e.target.value })}
          className="w-full px-3 py-2 border border-outline rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 min-h-[100px]"
          placeholder="输入伏笔描述"
        />
      </div>
    </>
  );
}

// 冲突编辑表单
function ConflictForm({ conflict, onChange }: { conflict: Conflict; onChange: (conflict: Conflict) => void }) {
  return (
    <>
      <div>
        <label className="block text-sm font-medium text-on-surface-variant mb-2">名称</label>
        <input
          type="text"
          value={conflict.name}
          onChange={(e) => onChange({ ...conflict, name: e.target.value })}
          className="w-full px-3 py-2 border border-outline rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          placeholder="输入冲突名称"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-on-surface-variant mb-2">类型</label>
        <select
          value={conflict.type}
          onChange={(e) => onChange({ ...conflict, type: e.target.value as Conflict['type'] })}
          className="w-full px-3 py-2 border border-outline rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="character">人物冲突</option>
          <option value="environment">环境冲突</option>
          <option value="internal">内心冲突</option>
          <option value="social">社会冲突</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-on-surface-variant mb-2">强度</label>
        <select
          value={conflict.intensity}
          onChange={(e) => onChange({ ...conflict, intensity: e.target.value as Conflict['intensity'] })}
          className="w-full px-3 py-2 border border-outline rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="low">低</option>
          <option value="medium">中</option>
          <option value="high">高</option>
          <option value="critical">关键</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-on-surface-variant mb-2">状态</label>
        <select
          value={conflict.status}
          onChange={(e) => onChange({ ...conflict, status: e.target.value as Conflict['status'] })}
          className="w-full px-3 py-2 border border-outline rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="active">活跃</option>
          <option value="escalating">升级中</option>
          <option value="resolving">缓解中</option>
          <option value="resolved">已解决</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-on-surface-variant mb-2">涉及角色</label>
        <input
          type="text"
          value={conflict.characters}
          onChange={(e) => onChange({ ...conflict, characters: e.target.value })}
          className="w-full px-3 py-2 border border-outline rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          placeholder="例如: 张三, 李四"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-on-surface-variant mb-2">描述</label>
        <textarea
          value={conflict.description}
          onChange={(e) => onChange({ ...conflict, description: e.target.value })}
          className="w-full px-3 py-2 border border-outline rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 min-h-[100px]"
          placeholder="输入冲突描述"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-on-surface-variant mb-2">解决方案</label>
        <textarea
          value={conflict.resolution}
          onChange={(e) => onChange({ ...conflict, resolution: e.target.value })}
          className="w-full px-3 py-2 border border-outline rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 min-h-[80px]"
          placeholder="输入解决方案"
        />
      </div>
    </>
  );
}

// 分镜编辑表单（含章节/场景关联）
function StoryboardForm({
  storyboard,
  chapters,
  scenes,
  onChange,
}: {
  storyboard: Storyboard;
  chapters: { id: string; title: string }[];
  scenes: { id: string; name: string }[];
  onChange: (storyboard: Storyboard) => void;
}) {
  return (
    <>
      <div>
        <label className="block text-sm font-medium text-on-surface-variant mb-2">标题</label>
        <input
          type="text"
          value={storyboard.title}
          onChange={(e) => onChange({ ...storyboard, title: e.target.value })}
          className="w-full px-3 py-2 border border-outline rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          placeholder="输入分镜标题"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-on-surface-variant mb-2">关联章节</label>
          <select
            value={storyboard.chapter_id || ''}
            onChange={(e) => onChange({ ...storyboard, chapter_id: e.target.value || null })}
            className="w-full px-3 py-2 border border-outline rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">未关联</option>
            {chapters.map((c) => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-on-surface-variant mb-2">关联场景</label>
          <select
            value={storyboard.scene_id || ''}
            onChange={(e) => onChange({ ...storyboard, scene_id: e.target.value || null })}
            className="w-full px-3 py-2 border border-outline rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">未关联</option>
            {scenes.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-on-surface-variant mb-2">镜头类型</label>
        <select
          value={storyboard.shot_type}
          onChange={(e) => onChange({ ...storyboard, shot_type: e.target.value as Storyboard['shot_type'] })}
          className="w-full px-3 py-2 border border-outline rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="wide">远景</option>
          <option value="medium">中景</option>
          <option value="close">近景</option>
          <option value="extreme_close">特写</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-on-surface-variant mb-2">镜头运动</label>
        <select
          value={storyboard.camera_movement}
          onChange={(e) => onChange({ ...storyboard, camera_movement: e.target.value as Storyboard['camera_movement'] })}
          className="w-full px-3 py-2 border border-outline rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="static">固定</option>
          <option value="pan">摇镜</option>
          <option value="tilt">倾斜</option>
          <option value="zoom">变焦</option>
          <option value="dolly">移动</option>
          <option value="crane">升降</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-on-surface-variant mb-2">时长（秒）</label>
        <input
          type="number"
          value={storyboard.duration}
          onChange={(e) => onChange({ ...storyboard, duration: parseFloat(e.target.value) || 0 })}
          className="w-full px-3 py-2 border border-outline rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          placeholder="0"
          min="0"
          step="0.1"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-on-surface-variant mb-2">描述</label>
        <textarea
          value={storyboard.description}
          onChange={(e) => onChange({ ...storyboard, description: e.target.value })}
          className="w-full px-3 py-2 border border-outline rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 min-h-[100px]"
          placeholder="输入分镜描述"
        />
      </div>
    </>
  );
}

// 素材编辑表单
function AssetForm({ asset, onChange }: { asset: Asset; onChange: (asset: Asset) => void }) {
  return (
    <>
      <div>
        <label className="block text-sm font-medium text-on-surface-variant mb-2">名称</label>
        <input
          type="text"
          value={asset.name}
          onChange={(e) => onChange({ ...asset, name: e.target.value })}
          className="w-full px-3 py-2 border border-outline rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          placeholder="输入素材名称"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-on-surface-variant mb-2">类型</label>
        <select
          value={asset.type}
          onChange={(e) => onChange({ ...asset, type: e.target.value as Asset['type'] })}
          className="w-full px-3 py-2 border border-outline rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="image">图片</option>
          <option value="video">视频</option>
          <option value="audio">音频</option>
          <option value="document">文档</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-on-surface-variant mb-2">标签（逗号分隔）</label>
        <input
          type="text"
          value={asset.tags.join(', ')}
          onChange={(e) => onChange({ ...asset, tags: e.target.value.split(',').map(t => t.trim()).filter(t => t) })}
          className="w-full px-3 py-2 border border-outline rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          placeholder="例如: 人物, 背景, 道具"
        />
      </div>
    </>
  );
}

// 伏笔视图（显示铺设/回收场景关联）
function CluesView({
  clues,
  scenes,
  onEdit,
  onDelete,
}: {
  clues: Clue[];
  scenes: { id: string; name: string }[];
  onEdit: (clue: Clue) => void;
  onDelete: (id: string) => void;
}) {
  if (clues.length === 0) {
    return (
      <div className="text-center py-12 text-on-surface-secondary">
        <div className="text-4xl mb-4">🔗</div>
        <p>暂无伏笔</p>
        <p className="text-sm mt-2">点击"新建"创建第一个伏笔</p>
      </div>
    );
  }

  const sceneName = (id: string | null) => scenes.find((s) => s.id === id)?.name;

  return (
    <div className="grid gap-3">
      {clues.map((clue) => {
        const setup = sceneName(clue.setup_scene_id);
        const payoff = sceneName(clue.payoff_scene_id);
        return (
          <div key={clue.id} className="group p-4 bg-surface-secondary rounded-lg border border-outline hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-2">
              <h3 className="font-medium text-on-surface flex-1">{clue.name}</h3>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-1 rounded ${clue.source === 'ai_detected' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300' : 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'}`}>
                  {clue.source === 'ai_detected' ? '🤖 AI检测' : '✍️ 手动'}
                </span>
                <span className={`text-xs px-2 py-1 rounded ${clue.status === 'resolved' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' : 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300'}`}>
                  {clue.status === 'open' ? '📂 未解决' : '✅ 已解决'}
                </span>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                  <button onClick={() => onEdit(clue)} className="p-1.5 text-primary-500 hover:bg-surface-primary rounded transition-colors text-sm" title="编辑">✏️</button>
                  <button onClick={() => onDelete(clue.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded transition-colors text-sm" title="删除">🗑️</button>
                </div>
              </div>
            </div>
            {(setup || payoff) && (
              <div className="flex items-center gap-2 mb-2 text-xs">
                <span className="px-2 py-1 rounded bg-surface-primary text-on-surface-secondary">
                  🌱 铺设：{setup || '未关联'}
                </span>
                <span className="text-on-surface-secondary">→</span>
                <span className="px-2 py-1 rounded bg-surface-primary text-on-surface-secondary">
                  💥 回收：{payoff || '未关联'}
                </span>
              </div>
            )}
            {clue.description && <p className="text-sm text-on-surface-secondary">{clue.description}</p>}
          </div>
        );
      })}
    </div>
  );
}

// 冲突视图
function ConflictsView({ conflicts, onEdit, onDelete }: { conflicts: Conflict[]; onEdit: (conflict: Conflict) => void; onDelete: (id: string) => void }) {
  if (conflicts.length === 0) {
    return (
      <div className="text-center py-12 text-on-surface-secondary">
        <div className="text-4xl mb-4">⚔️</div>
        <p>暂无冲突</p>
        <p className="text-sm mt-2">点击"新建"创建第一个冲突</p>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {conflicts.map((conflict) => (
        <div key={conflict.id} className="group p-4 bg-white rounded-lg border border-outline hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between mb-2">
            <h3 className="font-medium text-on-surface flex-1">{conflict.name}</h3>
            <div className="flex items-center gap-2">
              <span className="text-xs px-2 py-1 rounded bg-surface-primary text-on-surface-secondary">
                {conflict.type === 'character' && '👥 人物'}
                {conflict.type === 'environment' && '🌍 环境'}
                {conflict.type === 'internal' && '💭 内心'}
                {conflict.type === 'social' && '🏛️ 社会'}
              </span>
              <span className={`text-xs px-2 py-1 rounded ${
                conflict.intensity === 'critical' ? 'bg-red-100 text-red-700' :
                conflict.intensity === 'high' ? 'bg-orange-100 text-orange-700' :
                conflict.intensity === 'medium' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-700'
              }`}>
                {conflict.intensity === 'critical' && '🔴 关键'}
                {conflict.intensity === 'high' && '🟠 高'}
                {conflict.intensity === 'medium' && '🟡 中'}
                {conflict.intensity === 'low' && '🟢 低'}
              </span>
              <span className={`text-xs px-2 py-1 rounded ${
                conflict.status === 'resolved' ? 'bg-green-100 text-green-700' :
                conflict.status === 'resolving' ? 'bg-blue-100 text-blue-700' :
                conflict.status === 'escalating' ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-700'
              }`}>
                {conflict.status === 'active' && '🔵 活跃'}
                {conflict.status === 'escalating' && '📈 升级'}
                {conflict.status === 'resolving' && '📉 缓解'}
                {conflict.status === 'resolved' && '✅ 已解决'}
              </span>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                <button onClick={() => onEdit(conflict)} className="p-1.5 text-primary-500 hover:bg-surface-primary rounded transition-colors text-sm" title="编辑">✏️</button>
                <button onClick={() => onDelete(conflict.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded transition-colors text-sm" title="删除">🗑️</button>
              </div>
            </div>
          </div>
          {conflict.description && <p className="text-sm text-on-surface-secondary mb-2">{conflict.description}</p>}
          {conflict.characters && <p className="text-xs text-on-surface-secondary"><span className="font-medium">涉及角色：</span>{conflict.characters}</p>}
        </div>
      ))}
    </div>
  );
}

// 分镜视图（总时长 + 章节关联 + 同级排序）
function StoryboardsView({
  storyboards,
  chapters,
  onEdit,
  onDelete,
  onMove,
}: {
  storyboards: Storyboard[];
  chapters: { id: string; title: string }[];
  onEdit: (storyboard: Storyboard) => void;
  onDelete: (id: string) => void;
  onMove: (board: Storyboard, direction: -1 | 1) => void;
}) {
  if (storyboards.length === 0) {
    return (
      <div className="text-center py-12 text-on-surface-secondary">
        <div className="text-4xl mb-4">📹</div>
        <p>暂无分镜</p>
        <p className="text-sm mt-2">点击"新建"创建第一个分镜</p>
      </div>
    );
  }

  const sorted = [...storyboards].sort((a, b) => a.order - b.order);
  const totalDuration = storyboards.reduce((sum, s) => sum + (s.duration || 0), 0);
  const chapterTitle = (id: string | null) => chapters.find((c) => c.id === id)?.title;

  return (
    <div className="space-y-4">
      {/* 总时长概览 */}
      <div className="p-4 bg-surface-secondary rounded-lg border border-outline flex items-center justify-between">
        <span className="text-sm font-medium text-on-surface">
          共 {storyboards.length} 个镜头
        </span>
        <span className="text-sm font-semibold text-primary-500">
          总时长 {Math.floor(totalDuration / 60)} 分 {Math.round(totalDuration % 60)} 秒
        </span>
      </div>

      <div className="grid gap-3">
        {sorted.map((board, index) => (
          <div key={board.id} className="group p-4 bg-surface-secondary rounded-lg border border-outline hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className="text-xs px-2 py-1 rounded bg-surface-primary text-on-surface-secondary font-mono">#{index + 1}</span>
                  <h3 className="font-medium text-on-surface">{board.title}</h3>
                  {board.chapter_id && chapterTitle(board.chapter_id) && (
                    <span className="text-xs px-2 py-1 rounded bg-primary-100 text-primary-700 dark:bg-primary-900 dark:text-primary-300">
                      📖 {chapterTitle(board.chapter_id)}
                    </span>
                  )}
                </div>
                {board.description && <p className="text-sm text-on-surface-secondary mb-2">{board.description}</p>}
              </div>
              <div className="flex items-start gap-2">
                <div className="flex flex-col gap-1">
                  <span className="text-xs px-2 py-1 rounded bg-surface-primary text-on-surface-secondary whitespace-nowrap">
                    {board.shot_type === 'wide' && '🎞️ 远景'}
                    {board.shot_type === 'medium' && '📷 中景'}
                    {board.shot_type === 'close' && '🔍 近景'}
                    {board.shot_type === 'extreme_close' && '🔎 特写'}
                  </span>
                  <span className="text-xs px-2 py-1 rounded bg-surface-primary text-on-surface-secondary whitespace-nowrap">
                    {board.camera_movement === 'static' && '📍 固定'}
                    {board.camera_movement === 'pan' && '↔️ 摇镜'}
                    {board.camera_movement === 'tilt' && '↕️ 倾斜'}
                    {board.camera_movement === 'zoom' && '🔍 变焦'}
                    {board.camera_movement === 'dolly' && '🎬 移动'}
                    {board.camera_movement === 'crane' && '🏗️ 升降'}
                  </span>
                  {board.duration > 0 && <span className="text-xs px-2 py-1 rounded bg-surface-primary text-on-surface-secondary whitespace-nowrap">⏱️ {board.duration}s</span>}
                </div>
                <div className="flex flex-col gap-1">
                  <button onClick={() => onMove(board, -1)} disabled={index === 0} className="p-1.5 text-on-surface-secondary hover:bg-surface-primary rounded transition-colors text-sm disabled:opacity-30" title="上移">↑</button>
                  <button onClick={() => onMove(board, 1)} disabled={index === sorted.length - 1} className="p-1.5 text-on-surface-secondary hover:bg-surface-primary rounded transition-colors text-sm disabled:opacity-30" title="下移">↓</button>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => onEdit(board)} className="p-1.5 text-primary-500 hover:bg-surface-primary rounded transition-colors text-sm" title="编辑">✏️</button>
                  <button onClick={() => onDelete(board.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded transition-colors text-sm" title="删除">🗑️</button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// 素材视图（图片缩略图预览 + 打开所在文件夹）
function AssetsView({
  assets,
  onEdit,
  onDelete,
  onReveal,
}: {
  assets: Asset[];
  onEdit: (asset: Asset) => void;
  onDelete: (id: string) => void;
  onReveal: (asset: Asset) => void;
}) {
  if (assets.length === 0) {
    return (
      <div className="text-center py-12 text-on-surface-secondary">
        <div className="text-4xl mb-4">📦</div>
        <p>暂无素材</p>
        <p className="text-sm mt-2">点击"导入素材"选择本地文件（图片/视频/音频/文档）</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {assets.map((asset) => (
        <div key={asset.id} className="group bg-surface-secondary rounded-lg border border-outline hover:shadow-md transition-shadow relative overflow-hidden">
          <div className="absolute top-2 right-2 z-10 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {asset.type === 'image' && asset.file_path && (
              <button onClick={() => onReveal(asset)} className="p-1.5 bg-surface-primary text-on-surface-secondary hover:text-on-surface rounded shadow-sm transition-colors text-sm" title="打开所在文件夹">📂</button>
            )}
            <button onClick={() => onEdit(asset)} className="p-1.5 bg-surface-primary text-primary-500 hover:bg-surface-tertiary rounded shadow-sm transition-colors text-sm" title="编辑">✏️</button>
            <button onClick={() => onDelete(asset.id)} className="p-1.5 bg-surface-primary text-red-500 hover:bg-red-50 rounded shadow-sm transition-colors text-sm" title="删除">🗑️</button>
          </div>

          {/* 图片素材：真实缩略图预览 */}
          {asset.type === 'image' && asset.file_path ? (
            <div className="aspect-video bg-surface-tertiary overflow-hidden">
              <img
                src={convertFileSrc(asset.file_path)}
                alt={asset.name}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </div>
          ) : (
            <div className="aspect-video bg-surface-tertiary flex items-center justify-center">
              <span className="text-4xl opacity-60">
                {asset.type === 'video' && '🎥'}
                {asset.type === 'audio' && '🎵'}
                {asset.type === 'document' && '📄'}
              </span>
            </div>
          )}

          <div className="p-3 flex flex-col gap-2">
            <div>
              <h3 className="font-medium text-on-surface truncate">{asset.name}</h3>
              <p className="text-xs text-on-surface-secondary">{formatFileSize(asset.file_size)}</p>
            </div>
            {asset.tags && asset.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {asset.tags.map((tag, index) => (
                  <span key={index} className="text-xs px-2 py-0.5 rounded bg-surface-primary text-on-surface-secondary">{tag}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
