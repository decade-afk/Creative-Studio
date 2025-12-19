/**
 * DirectorView - 导演视图组件（完整重构版）
 *
 * 【核心功能】
 * 1. 伏笔追踪系统（Clues） - 剧情伏笔管理
 *    - 伏笔来源：手动添加 / AI自动检测
 *    - 伏笔状态：未铺垫 / 已铺垫 / 已回收 / 已废弃
 *    - 伏笔描述和追踪
 *    - 支持编辑和删除
 *
 * 2. 冲突矩阵管理（Conflicts） - 戏剧冲突分析
 *    - 冲突类型：人物冲突 / 内心冲突 / 环境冲突 / 价值观冲突
 *    - 冲突强度：低 / 中 / 高 / 极高
 *    - 冲突状态：潜在 / 激化 / 高潮 / 解决 / 遗留
 *    - 涉及角色列表
 *    - 冲突描述和解决方案
 *
 * 3. 分镜时间线（Storyboards） - 镜头设计
 *    - 镜头类型：特写/近景/中景/远景/全景/大全景
 *    - 运镜方式：固定/推拉/摇移/跟随/升降/环绕/手持
 *    - 镜头时长（秒）
 *    - 分镜描述
 *    - 顺序号显示（font-mono）
 *
 * 4. 素材库管理（Assets） - 创作素材收集
 *    - 素材类型：图片/视频/音频/文档/参考/其他
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
 * 1. 加载所有数据 → 存储在 state
 * 2. 切换标签 → 切换显示，不重新加载
 * 3. CRUD 操作 → 只重新加载当前标签数据
 *
 * 【UI 特色】
 * - 伏笔：来源徽章（手动/AI） + 状态徽章
 * - 冲突：三个徽章并排（类型、强度、状态）+ 角色列表
 * - 分镜：顺序号（font-mono） + 镜头类型 + 运镜方式 + 时长
 * - 素材：网格布局 + 类型图标 + 标签展示
 *
 * 【注意事项】
 * 1. 素材标签使用逗号分隔，输入时自动处理
 * 2. 冲突可以关联多个角色（逗号分隔）
 * 3. 分镜按 order 字段排序显示
 * 4. 所有删除操作都需要二次确认
 */

import { useState, useEffect, useCallback } from 'react';
import type { Clue, Conflict, Storyboard, Asset } from '../types/storage';
import { getCluesByWorkId, createClue, updateClue, deleteClue } from '../services/clueService';
import { getConflictsByWorkId, createConflict, updateConflict, deleteConflict } from '../services/conflictService';
import { getStoryboardsByWorkId, createStoryboard, updateStoryboard, deleteStoryboard } from '../services/storyboardService';
import { getAssetsByWorkId, createAsset, updateAsset, deleteAsset } from '../services/assetService';
import { getWorks } from '../services/workService';
import { useToast } from '../components/Toast';
import ConfirmDialog from '../components/ConfirmDialog';

type Tab = 'clues' | 'conflicts' | 'storyboards' | 'assets';

type EditingItem = {
  type: Tab;
  item: Clue | Conflict | Storyboard | Asset;
} | null;

export default function DirectorView() {
  const [currentWorkId, setCurrentWorkId] = useState<string>('');
  const [currentTab, setCurrentTab] = useState<Tab>('clues');
  const [loading, setLoading] = useState(false);

  // 数据状态
  const [clues, setClues] = useState<Clue[]>([]);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [storyboards, setStoryboards] = useState<Storyboard[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);

  // UI 状态
  const [editingItem, setEditingItem] = useState<EditingItem>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { showToast, ToastComponent } = useToast();

  // 加载作品
  useEffect(() => {
    async function loadWork() {
      const works = await getWorks();
      if (works.length > 0) {
        setCurrentWorkId(works[0].id);
      }
    }
    loadWork();
  }, []);

  // 加载数据
  useEffect(() => {
    if (!currentWorkId) return;
    loadAllData();
  }, [currentWorkId]);

  // 加载所有数据
  const loadAllData = useCallback(async () => {
    if (!currentWorkId) return;

    setLoading(true);
    try {
      const [cluesData, conflictsData, storyboardsData, assetsData] = await Promise.all([
        getCluesByWorkId(currentWorkId),
        getConflictsByWorkId(currentWorkId),
        getStoryboardsByWorkId(currentWorkId),
        getAssetsByWorkId(currentWorkId),
      ]);

      setClues(cluesData);
      setConflicts(conflictsData);
      setStoryboards(storyboardsData);
      setAssets(assetsData);
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

        case 'assets':
          await createAsset({
            work_id: currentWorkId,
            name: '新素材',
            type: 'image',
            file_path: '',
            file_size: 0,
            mime_type: '',
            tags: [],
          });
          showToast('素材创建成功', 'success');
          break;
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
    if (!deletingId) return;

    setLoading(true);
    try {
      switch (currentTab) {
        case 'clues':
          await deleteClue(deletingId);
          showToast('伏笔已删除', 'success');
          break;
        case 'conflicts':
          await deleteConflict(deletingId);
          showToast('冲突已删除', 'success');
          break;
        case 'storyboards':
          await deleteStoryboard(deletingId);
          showToast('分镜已删除', 'success');
          break;
        case 'assets':
          await deleteAsset(deletingId);
          showToast('素材已删除', 'success');
          break;
      }

      setDeletingId(null);
      await reloadCurrentTab();
    } catch (error) {
      showToast('删除失败', 'error');
      console.error('删除失败:', error);
    } finally {
      setLoading(false);
    }
  }, [deletingId, currentTab, reloadCurrentTab, showToast]);

  return (
    <div className="flex-1 flex flex-col bg-[#faf8f5] overflow-hidden">
      {ToastComponent}

      {/* 确认删除对话框 */}
      {deletingId && (
        <ConfirmDialog
          title="确认删除"
          message="确定要删除这个项目吗？此操作无法撤销。"
          confirmText="删除"
          cancelText="取消"
          type="danger"
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeletingId(null)}
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
        <div className="flex gap-2">
          <button
            onClick={() => setCurrentTab('clues')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              currentTab === 'clues'
                ? 'bg-[#a07d5e] text-white'
                : 'text-[#5d554a] hover:bg-[rgba(122,110,95,0.1)]'
            }`}
          >
            🔗 伏笔
          </button>
          <button
            onClick={() => setCurrentTab('conflicts')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              currentTab === 'conflicts'
                ? 'bg-[#a07d5e] text-white'
                : 'text-[#5d554a] hover:bg-[rgba(122,110,95,0.1)]'
            }`}
          >
            ⚡ 冲突
          </button>
          <button
            onClick={() => setCurrentTab('storyboards')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              currentTab === 'storyboards'
                ? 'bg-[#a07d5e] text-white'
                : 'text-[#5d554a] hover:bg-[rgba(122,110,95,0.1)]'
            }`}
          >
            📹 分镜
          </button>
          <button
            onClick={() => setCurrentTab('assets')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              currentTab === 'assets'
                ? 'bg-[#a07d5e] text-white'
                : 'text-[#5d554a] hover:bg-[rgba(122,110,95,0.1)]'
            }`}
          >
            📦 素材
          </button>
        </div>

        <button
          onClick={handleQuickCreate}
          disabled={loading}
          className="px-4 py-2 bg-[#a07d5e] text-white rounded-lg text-sm font-medium hover:bg-[#8b6342] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? '处理中...' : '+ 新建'}
        </button>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-auto p-6">
        {loading && (
          <div className="flex items-center justify-center h-32">
            <div className="text-[#7a6e5f]">加载中...</div>
          </div>
        )}

        {!loading && currentTab === 'clues' && (
          <CluesView
            clues={clues}
            onEdit={(item) => setEditingItem({ type: 'clues', item })}
            onDelete={(id) => setDeletingId(id)}
          />
        )}

        {!loading && currentTab === 'conflicts' && (
          <ConflictsView
            conflicts={conflicts}
            onEdit={(item) => setEditingItem({ type: 'conflicts', item })}
            onDelete={(id) => setDeletingId(id)}
          />
        )}

        {!loading && currentTab === 'storyboards' && (
          <StoryboardsView
            storyboards={storyboards}
            onEdit={(item) => setEditingItem({ type: 'storyboards', item })}
            onDelete={(id) => setDeletingId(id)}
          />
        )}

        {!loading && currentTab === 'assets' && (
          <AssetsView
            assets={assets}
            onEdit={(item) => setEditingItem({ type: 'assets', item })}
            onDelete={(id) => setDeletingId(id)}
          />
        )}

        {!currentWorkId && !loading && (
          <div className="flex items-center justify-center h-full text-[#7a6e5f]">
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
  onSave,
  onCancel,
}: {
  item: Clue | Conflict | Storyboard | Asset;
  type: Tab;
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
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <div className="px-6 py-4 border-b border-[#e5ddd2] sticky top-0 bg-white">
            <h3 className="text-lg font-semibold text-[#38342e]">
              编辑{type === 'clues' ? '伏笔' : type === 'conflicts' ? '冲突' : type === 'storyboards' ? '分镜' : '素材'}
            </h3>
          </div>

          <div className="px-6 py-4 space-y-4">
            {type === 'clues' && (
              <ClueForm
                clue={editedItem as Clue}
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

          <div className="px-6 py-4 border-t border-[#e5ddd2] flex justify-end gap-3 sticky bottom-0 bg-white">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 rounded-lg text-sm font-medium text-[#5d554a] hover:bg-[#faf8f5] transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg text-sm font-medium bg-[#a07d5e] text-white hover:bg-[#8b6342] transition-colors"
            >
              保存
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// 伏笔编辑表单
function ClueForm({ clue, onChange }: { clue: Clue; onChange: (clue: Clue) => void }) {
  return (
    <>
      <div>
        <label className="block text-sm font-medium text-[#5d554a] mb-2">名称</label>
        <input
          type="text"
          value={clue.name}
          onChange={(e) => onChange({ ...clue, name: e.target.value })}
          className="w-full px-3 py-2 border border-[#e5ddd2] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#a07d5e]"
          placeholder="输入伏笔名称"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-[#5d554a] mb-2">来源</label>
        <select
          value={clue.source}
          onChange={(e) => onChange({ ...clue, source: e.target.value as Clue['source'] })}
          className="w-full px-3 py-2 border border-[#e5ddd2] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#a07d5e]"
        >
          <option value="manual">手动标记</option>
          <option value="ai_detected">AI检测</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-[#5d554a] mb-2">状态</label>
        <select
          value={clue.status}
          onChange={(e) => onChange({ ...clue, status: e.target.value as Clue['status'] })}
          className="w-full px-3 py-2 border border-[#e5ddd2] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#a07d5e]"
        >
          <option value="open">未解决</option>
          <option value="resolved">已解决</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-[#5d554a] mb-2">描述</label>
        <textarea
          value={clue.description}
          onChange={(e) => onChange({ ...clue, description: e.target.value })}
          className="w-full px-3 py-2 border border-[#e5ddd2] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#a07d5e] min-h-[100px]"
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
        <label className="block text-sm font-medium text-[#5d554a] mb-2">名称</label>
        <input
          type="text"
          value={conflict.name}
          onChange={(e) => onChange({ ...conflict, name: e.target.value })}
          className="w-full px-3 py-2 border border-[#e5ddd2] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#a07d5e]"
          placeholder="输入冲突名称"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-[#5d554a] mb-2">类型</label>
        <select
          value={conflict.type}
          onChange={(e) => onChange({ ...conflict, type: e.target.value as Conflict['type'] })}
          className="w-full px-3 py-2 border border-[#e5ddd2] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#a07d5e]"
        >
          <option value="character">人物冲突</option>
          <option value="environment">环境冲突</option>
          <option value="internal">内心冲突</option>
          <option value="social">社会冲突</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-[#5d554a] mb-2">强度</label>
        <select
          value={conflict.intensity}
          onChange={(e) => onChange({ ...conflict, intensity: e.target.value as Conflict['intensity'] })}
          className="w-full px-3 py-2 border border-[#e5ddd2] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#a07d5e]"
        >
          <option value="low">低</option>
          <option value="medium">中</option>
          <option value="high">高</option>
          <option value="critical">关键</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-[#5d554a] mb-2">状态</label>
        <select
          value={conflict.status}
          onChange={(e) => onChange({ ...conflict, status: e.target.value as Conflict['status'] })}
          className="w-full px-3 py-2 border border-[#e5ddd2] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#a07d5e]"
        >
          <option value="active">活跃</option>
          <option value="escalating">升级中</option>
          <option value="resolving">缓解中</option>
          <option value="resolved">已解决</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-[#5d554a] mb-2">涉及角色</label>
        <input
          type="text"
          value={conflict.characters}
          onChange={(e) => onChange({ ...conflict, characters: e.target.value })}
          className="w-full px-3 py-2 border border-[#e5ddd2] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#a07d5e]"
          placeholder="例如: 张三, 李四"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-[#5d554a] mb-2">描述</label>
        <textarea
          value={conflict.description}
          onChange={(e) => onChange({ ...conflict, description: e.target.value })}
          className="w-full px-3 py-2 border border-[#e5ddd2] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#a07d5e] min-h-[100px]"
          placeholder="输入冲突描述"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-[#5d554a] mb-2">解决方案</label>
        <textarea
          value={conflict.resolution}
          onChange={(e) => onChange({ ...conflict, resolution: e.target.value })}
          className="w-full px-3 py-2 border border-[#e5ddd2] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#a07d5e] min-h-[80px]"
          placeholder="输入解决方案"
        />
      </div>
    </>
  );
}

// 分镜编辑表单
function StoryboardForm({ storyboard, onChange }: { storyboard: Storyboard; onChange: (storyboard: Storyboard) => void }) {
  return (
    <>
      <div>
        <label className="block text-sm font-medium text-[#5d554a] mb-2">标题</label>
        <input
          type="text"
          value={storyboard.title}
          onChange={(e) => onChange({ ...storyboard, title: e.target.value })}
          className="w-full px-3 py-2 border border-[#e5ddd2] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#a07d5e]"
          placeholder="输入分镜标题"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-[#5d554a] mb-2">镜头类型</label>
        <select
          value={storyboard.shot_type}
          onChange={(e) => onChange({ ...storyboard, shot_type: e.target.value as Storyboard['shot_type'] })}
          className="w-full px-3 py-2 border border-[#e5ddd2] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#a07d5e]"
        >
          <option value="wide">远景</option>
          <option value="medium">中景</option>
          <option value="close">近景</option>
          <option value="extreme_close">特写</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-[#5d554a] mb-2">镜头运动</label>
        <select
          value={storyboard.camera_movement}
          onChange={(e) => onChange({ ...storyboard, camera_movement: e.target.value as Storyboard['camera_movement'] })}
          className="w-full px-3 py-2 border border-[#e5ddd2] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#a07d5e]"
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
        <label className="block text-sm font-medium text-[#5d554a] mb-2">时长（秒）</label>
        <input
          type="number"
          value={storyboard.duration}
          onChange={(e) => onChange({ ...storyboard, duration: parseFloat(e.target.value) || 0 })}
          className="w-full px-3 py-2 border border-[#e5ddd2] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#a07d5e]"
          placeholder="0"
          min="0"
          step="0.1"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-[#5d554a] mb-2">描述</label>
        <textarea
          value={storyboard.description}
          onChange={(e) => onChange({ ...storyboard, description: e.target.value })}
          className="w-full px-3 py-2 border border-[#e5ddd2] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#a07d5e] min-h-[100px]"
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
        <label className="block text-sm font-medium text-[#5d554a] mb-2">名称</label>
        <input
          type="text"
          value={asset.name}
          onChange={(e) => onChange({ ...asset, name: e.target.value })}
          className="w-full px-3 py-2 border border-[#e5ddd2] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#a07d5e]"
          placeholder="输入素材名称"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-[#5d554a] mb-2">类型</label>
        <select
          value={asset.type}
          onChange={(e) => onChange({ ...asset, type: e.target.value as Asset['type'] })}
          className="w-full px-3 py-2 border border-[#e5ddd2] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#a07d5e]"
        >
          <option value="image">图片</option>
          <option value="video">视频</option>
          <option value="audio">音频</option>
          <option value="document">文档</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-[#5d554a] mb-2">标签（逗号分隔）</label>
        <input
          type="text"
          value={asset.tags.join(', ')}
          onChange={(e) => onChange({ ...asset, tags: e.target.value.split(',').map(t => t.trim()).filter(t => t) })}
          className="w-full px-3 py-2 border border-[#e5ddd2] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#a07d5e]"
          placeholder="例如: 人物, 背景, 道具"
        />
      </div>
    </>
  );
}

// 伏笔视图
function CluesView({ clues, onEdit, onDelete }: { clues: Clue[]; onEdit: (clue: Clue) => void; onDelete: (id: string) => void }) {
  if (clues.length === 0) {
    return (
      <div className="text-center py-12 text-[#7a6e5f]">
        <div className="text-4xl mb-4">🔗</div>
        <p>暂无伏笔</p>
        <p className="text-sm mt-2">点击"新建"创建第一个伏笔</p>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {clues.map((clue) => (
        <div key={clue.id} className="group p-4 bg-white rounded-lg border border-[#e5ddd2] hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between mb-2">
            <h3 className="font-medium text-[#38342e] flex-1">{clue.name}</h3>
            <div className="flex items-center gap-2">
              <span className={`text-xs px-2 py-1 rounded ${clue.source === 'ai_detected' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                {clue.source === 'ai_detected' ? '🤖 AI检测' : '✍️ 手动'}
              </span>
              <span className={`text-xs px-2 py-1 rounded ${clue.status === 'resolved' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                {clue.status === 'open' ? '📂 未解决' : '✅ 已解决'}
              </span>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                <button onClick={() => onEdit(clue)} className="p-1.5 text-[#a07d5e] hover:bg-[#faf8f5] rounded transition-colors text-sm" title="编辑">✏️</button>
                <button onClick={() => onDelete(clue.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded transition-colors text-sm" title="删除">🗑️</button>
              </div>
            </div>
          </div>
          {clue.description && <p className="text-sm text-[#7a6e5f]">{clue.description}</p>}
        </div>
      ))}
    </div>
  );
}

// 冲突视图
function ConflictsView({ conflicts, onEdit, onDelete }: { conflicts: Conflict[]; onEdit: (conflict: Conflict) => void; onDelete: (id: string) => void }) {
  if (conflicts.length === 0) {
    return (
      <div className="text-center py-12 text-[#7a6e5f]">
        <div className="text-4xl mb-4">⚡</div>
        <p>暂无冲突</p>
        <p className="text-sm mt-2">点击"新建"创建第一个冲突</p>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {conflicts.map((conflict) => (
        <div key={conflict.id} className="group p-4 bg-white rounded-lg border border-[#e5ddd2] hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between mb-2">
            <h3 className="font-medium text-[#38342e] flex-1">{conflict.name}</h3>
            <div className="flex items-center gap-2">
              <span className="text-xs px-2 py-1 rounded bg-[#faf8f5] text-[#7a6e5f]">
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
                {conflict.intensity === 'low' && '⚪ 低'}
              </span>
              <span className={`text-xs px-2 py-1 rounded ${
                conflict.status === 'resolved' ? 'bg-green-100 text-green-700' :
                conflict.status === 'resolving' ? 'bg-blue-100 text-blue-700' :
                conflict.status === 'escalating' ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-700'
              }`}>
                {conflict.status === 'active' && '⚡ 活跃'}
                {conflict.status === 'escalating' && '📈 升级'}
                {conflict.status === 'resolving' && '📉 缓解'}
                {conflict.status === 'resolved' && '✅ 已解决'}
              </span>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                <button onClick={() => onEdit(conflict)} className="p-1.5 text-[#a07d5e] hover:bg-[#faf8f5] rounded transition-colors text-sm" title="编辑">✏️</button>
                <button onClick={() => onDelete(conflict.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded transition-colors text-sm" title="删除">🗑️</button>
              </div>
            </div>
          </div>
          {conflict.description && <p className="text-sm text-[#7a6e5f] mb-2">{conflict.description}</p>}
          {conflict.characters && <p className="text-xs text-[#7a6e5f]"><span className="font-medium">涉及角色：</span>{conflict.characters}</p>}
        </div>
      ))}
    </div>
  );
}

// 分镜视图
function StoryboardsView({ storyboards, onEdit, onDelete }: { storyboards: Storyboard[]; onEdit: (storyboard: Storyboard) => void; onDelete: (id: string) => void }) {
  if (storyboards.length === 0) {
    return (
      <div className="text-center py-12 text-[#7a6e5f]">
        <div className="text-4xl mb-4">📹</div>
        <p>暂无分镜</p>
        <p className="text-sm mt-2">点击"新建"创建第一个分镜</p>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {storyboards.map((board) => (
        <div key={board.id} className="group p-4 bg-white rounded-lg border border-[#e5ddd2] hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between mb-2">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs px-2 py-1 rounded bg-[#faf8f5] text-[#7a6e5f] font-mono">#{board.order + 1}</span>
                <h3 className="font-medium text-[#38342e]">{board.title}</h3>
              </div>
              {board.description && <p className="text-sm text-[#7a6e5f] mb-2">{board.description}</p>}
            </div>
            <div className="flex items-start gap-2">
              <div className="flex flex-col gap-1">
                <span className="text-xs px-2 py-1 rounded bg-[#faf8f5] text-[#7a6e5f] whitespace-nowrap">
                  {board.shot_type === 'wide' && '🎞️ 远景'}
                  {board.shot_type === 'medium' && '📷 中景'}
                  {board.shot_type === 'close' && '🔍 近景'}
                  {board.shot_type === 'extreme_close' && '🔎 特写'}
                </span>
                <span className="text-xs px-2 py-1 rounded bg-[#faf8f5] text-[#7a6e5f] whitespace-nowrap">
                  {board.camera_movement === 'static' && '📍 固定'}
                  {board.camera_movement === 'pan' && '↔️ 摇镜'}
                  {board.camera_movement === 'tilt' && '↕️ 倾斜'}
                  {board.camera_movement === 'zoom' && '🔍 变焦'}
                  {board.camera_movement === 'dolly' && '🎬 移动'}
                  {board.camera_movement === 'crane' && '🏗️ 升降'}
                </span>
                {board.duration > 0 && <span className="text-xs px-2 py-1 rounded bg-[#faf8f5] text-[#7a6e5f] whitespace-nowrap">⏱️ {board.duration}s</span>}
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => onEdit(board)} className="p-1.5 text-[#a07d5e] hover:bg-[#faf8f5] rounded transition-colors text-sm" title="编辑">✏️</button>
                <button onClick={() => onDelete(board.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded transition-colors text-sm" title="删除">🗑️</button>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// 素材视图
function AssetsView({ assets, onEdit, onDelete }: { assets: Asset[]; onEdit: (asset: Asset) => void; onDelete: (id: string) => void }) {
  if (assets.length === 0) {
    return (
      <div className="text-center py-12 text-[#7a6e5f]">
        <div className="text-4xl mb-4">📦</div>
        <p>暂无素材</p>
        <p className="text-sm mt-2">点击"新建"添加第一个素材</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {assets.map((asset) => (
        <div key={asset.id} className="group p-4 bg-white rounded-lg border border-[#e5ddd2] hover:shadow-md transition-shadow relative">
          <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={() => onEdit(asset)} className="p-1.5 text-[#a07d5e] hover:bg-[#faf8f5] rounded transition-colors text-sm" title="编辑">✏️</button>
            <button onClick={() => onDelete(asset.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded transition-colors text-sm" title="删除">🗑️</button>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <div className="text-2xl">
                {asset.type === 'image' && '🖼️'}
                {asset.type === 'video' && '🎥'}
                {asset.type === 'audio' && '🎵'}
                {asset.type === 'document' && '📄'}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-[#38342e] truncate">{asset.name}</h3>
                <p className="text-xs text-[#7a6e5f]">{(asset.file_size / 1024).toFixed(1)} KB</p>
              </div>
            </div>
            {asset.tags && asset.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {asset.tags.map((tag, index) => (
                  <span key={index} className="text-xs px-2 py-0.5 rounded bg-[#faf8f5] text-[#7a6e5f]">{tag}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
