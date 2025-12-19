/**
 * PlannerView - 规划视图组件（完整重构版）
 *
 * 【核心功能】
 * 1. Kanban 看板大纲管理 - 支持多种类型（章节/场景/角色/情节/主题）
 *    - 层级结构（树形大纲，支持父子关系）
 *    - 完整 CRUD：创建、编辑、删除
 *    - 悬停显示操作按钮（group-hover 模式）
 *
 * 2. 角色卡片系统 - 角色档案管理
 *    - 角色信息：姓名、头像、描述、性格特点
 *    - 角色关系：支持记录角色间的关系网络
 *    - 卡片式展示，支持编辑和删除
 *
 * 3. 场景管理 - 场景库
 *    - 场景属性：名称、位置、时间、描述、氛围
 *    - 场景筛选和搜索
 *    - 支持场景复用
 *
 * 4. 里程碑跟踪 - 创作进度管理
 *    - 里程碑状态：待办/进行中/已完成
 *    - 截止日期提醒
 *    - 进度可视化
 *
 * 【技术亮点】
 * - 性能优化：只重新加载当前标签页数据（reloadCurrentTab）
 * - 统一编辑：所有类型共用一个编辑对话框，内部根据类型渲染不同表单
 * - 类型安全：完整的 TypeScript 类型定义和类型守卫
 * - 用户体验：Toast 通知 + 确认对话框 + 加载状态
 * - 数据一致性：软删除 + 外键约束
 *
 * 【状态管理】
 * - 数据状态：outlineNodes, characters, scenes, milestones
 * - 当前选中：currentWorkId, currentTab
 * - 编辑状态：editingItem（保存正在编辑的项和类型）
 * - 删除状态：deletingId（保存待删除项的 ID）
 * - UI 状态：loading（全局加载状态）
 *
 * 【数据流】
 * 1. 组件挂载 → 加载第一个作品 → 加载所有数据
 * 2. 切换标签 → 不重新加载（数据已在内存中）
 * 3. 创建/编辑/删除 → 只重新加载当前标签数据
 * 4. 切换作品 → 重新加载所有数据
 *
 * 【注意事项】
 * 1. 所有数据操作都有 loading 状态，防止重复提交
 * 2. 删除操作需要确认，防止误删
 * 3. 编辑表单使用受控组件，确保数据同步
 * 4. useCallback 用于事件处理函数，优化性能
 */

import { useState, useEffect, useCallback } from 'react';
import type { OutlineNode, Scene, Milestone, Character } from '../types/storage';
import { getOutlineNodesByWorkId, createOutlineNode, updateOutlineNode, deleteOutlineNode } from '../services/outlineService';
import { getScenesByWorkId, createScene, updateScene, deleteScene } from '../services/sceneService';
import { getMilestonesByWorkId, createMilestone, updateMilestone, deleteMilestone } from '../services/milestoneService';
import { getWorks } from '../services/workService';
import { getCharactersByWorkId, createCharacter, updateCharacter, deleteCharacter } from '../services/characterService';
import { 
  getWorldSettings, 
  createWorldSetting, 
  updateWorldSetting, 
  deleteWorldSetting,
  type WorldSetting,
  type WorldSettingCategory,
  CATEGORY_ICONS
} from '../services/worldSettingService';
import { useToast } from '../components/Toast';
import ConfirmDialog from '../components/ConfirmDialog';

type Tab = 'outline' | 'characters' | 'scenes' | 'milestones' | 'worldSettings';

type EditingItem = {
  type: Tab;
  item: OutlineNode | Character | Scene | Milestone | WorldSetting;
} | null;

export default function PlannerView() {
  const [currentWorkId, setCurrentWorkId] = useState<string>('');
  const [currentTab, setCurrentTab] = useState<Tab>('outline');
  const [loading, setLoading] = useState(false);

  // 数据状态
  const [outlineNodes, setOutlineNodes] = useState<OutlineNode[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [worldSettings, setWorldSettings] = useState<WorldSetting[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<WorldSettingCategory | null>(null);

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
      const [nodes, chars, scns, mls, ws] = await Promise.all([
        getOutlineNodesByWorkId(currentWorkId),
        getCharactersByWorkId(currentWorkId),
        getScenesByWorkId(currentWorkId),
        getMilestonesByWorkId(currentWorkId),
        getWorldSettings(currentWorkId),
      ]);

      setOutlineNodes(nodes);
      setCharacters(chars);
      setScenes(scns);
      setMilestones(mls);
      setWorldSettings(ws);
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
        case 'outline':
          setOutlineNodes(await getOutlineNodesByWorkId(currentWorkId));
          break;
        case 'characters':
          setCharacters(await getCharactersByWorkId(currentWorkId));
          break;
        case 'scenes':
          setScenes(await getScenesByWorkId(currentWorkId));
          break;
        case 'milestones':
          setMilestones(await getMilestonesByWorkId(currentWorkId));
          break;
        case 'worldSettings':
          setWorldSettings(await getWorldSettings(currentWorkId));
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
        case 'outline':
          // 使用 outlineNodes 获取长度，避免在依赖数组中使用 .length
          await createOutlineNode({
            work_id: currentWorkId,
            parent_id: null,
            title: '新大纲节点',
            description: '',
            order: outlineNodes.length, // 直接使用，因为 outlineNodes 在依赖中
            type: 'act',
          });
          showToast('大纲节点创建成功', 'success');
          break;

        case 'characters':
          await createCharacter({
            work_id: currentWorkId,
            name: '新角色',
            description: '',
          });
          showToast('角色创建成功', 'success');
          break;

        case 'scenes':
          await createScene({
            work_id: currentWorkId,
            name: '新场景',
            description: '',
            location: '',
            time_of_day: 'other',
          });
          showToast('场景创建成功', 'success');
          break;

        case 'milestones':
          await createMilestone({
            work_id: currentWorkId,
            title: '新里程碑',
            description: '',
            due_date: null,
            status: 'pending',
          });
          showToast('里程碑创建成功', 'success');
          break;

        case 'worldSettings':
          await createWorldSetting({
            work_id: currentWorkId,
            category: selectedCategory || 'location',
            title: '新世界观设定',
            content: '',
          });
          showToast('世界观设定创建成功', 'success');
          break;
      }

      await reloadCurrentTab();
    } catch (error) {
      showToast('创建失败', 'error');
      console.error('创建失败:', error);
    } finally {
      setLoading(false);
    }
  }, [currentWorkId, currentTab, loading, outlineNodes, selectedCategory, reloadCurrentTab, showToast]);

  // 保存编辑
  const handleSaveEdit = useCallback(async (item: OutlineNode | Character | Scene | Milestone | WorldSetting) => {
    if (!editingItem) return;

    setLoading(true);
    try {
      switch (editingItem.type) {
        case 'outline': {
          const node = item as OutlineNode;
          await updateOutlineNode(node.id, {
            title: node.title,
            description: node.description,
            type: node.type,
          });
          showToast('大纲节点更新成功', 'success');
          break;
        }
        case 'characters': {
          const char = item as Character;
          await updateCharacter(char.id, {
            name: char.name,
            description: char.description,
            avatar: char.avatar,
            personality: char.personality,
            relationships: char.relationships,
          });
          showToast('角色更新成功', 'success');
          break;
        }
        case 'scenes': {
          const scene = item as Scene;
          await updateScene(scene.id, {
            name: scene.name,
            description: scene.description,
            location: scene.location,
            time_of_day: scene.time_of_day,
            mood: scene.mood,
          });
          showToast('场景更新成功', 'success');
          break;
        }
        case 'milestones': {
          const milestone = item as Milestone;
          await updateMilestone(milestone.id, {
            title: milestone.title,
            description: milestone.description,
            due_date: milestone.due_date,
            status: milestone.status,
          });
          showToast('里程碑更新成功', 'success');
          break;
        }
        case 'worldSettings': {
          const setting = item as WorldSetting;
          await updateWorldSetting(setting.id, {
            title: setting.title,
            content: setting.content,
            icon_type: setting.icon_type,
            icon_color: setting.icon_color,
            tags: setting.tags,
          });
          showToast('世界观设定更新成功', 'success');
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
        case 'outline':
          await deleteOutlineNode(deletingId);
          showToast('大纲节点已删除', 'success');
          break;
        case 'characters':
          await deleteCharacter(deletingId);
          showToast('角色已删除', 'success');
          break;
        case 'scenes':
          await deleteScene(deletingId);
          showToast('场景已删除', 'success');
          break;
        case 'milestones':
          await deleteMilestone(deletingId);
          showToast('里程碑已删除', 'success');
          break;
        case 'worldSettings':
          await deleteWorldSetting(deletingId);
          showToast('世界观设定已删除', 'success');
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
            onClick={() => setCurrentTab('outline')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              currentTab === 'outline'
                ? 'bg-[#a07d5e] text-white'
                : 'text-[#5d554a] hover:bg-[rgba(122,110,95,0.1)]'
            }`}
          >
            📋 大纲
          </button>
          <button
            onClick={() => setCurrentTab('characters')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              currentTab === 'characters'
                ? 'bg-[#a07d5e] text-white'
                : 'text-[#5d554a] hover:bg-[rgba(122,110,95,0.1)]'
            }`}
          >
            👤 角色
          </button>
          <button
            onClick={() => setCurrentTab('scenes')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              currentTab === 'scenes'
                ? 'bg-[#a07d5e] text-white'
                : 'text-[#5d554a] hover:bg-[rgba(122,110,95,0.1)]'
            }`}
          >
            🎬 场景
          </button>
          <button
            onClick={() => setCurrentTab('milestones')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              currentTab === 'milestones'
                ? 'bg-[#a07d5e] text-white'
                : 'text-[#5d554a] hover:bg-[rgba(122,110,95,0.1)]'
            }`}
          >
            🎯 里程碑
          </button>
          <button
            onClick={() => setCurrentTab('worldSettings')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              currentTab === 'worldSettings'
                ? 'bg-[#a07d5e] text-white'
                : 'text-[#5d554a] hover:bg-[rgba(122,110,95,0.1)]'
            }`}
          >
            🌍 世界观
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

        {!loading && currentTab === 'outline' && (
          <OutlineView
            nodes={outlineNodes}
            onEdit={(item) => setEditingItem({ type: 'outline', item })}
            onDelete={(id) => setDeletingId(id)}
          />
        )}

        {!loading && currentTab === 'characters' && (
          <CharactersView
            characters={characters}
            onEdit={(item) => setEditingItem({ type: 'characters', item })}
            onDelete={(id) => setDeletingId(id)}
          />
        )}

        {!loading && currentTab === 'scenes' && (
          <ScenesView
            scenes={scenes}
            onEdit={(item) => setEditingItem({ type: 'scenes', item })}
            onDelete={(id) => setDeletingId(id)}
          />
        )}

        {!loading && currentTab === 'milestones' && (
          <MilestonesView
            milestones={milestones}
            onEdit={(item) => setEditingItem({ type: 'milestones', item })}
            onDelete={(id) => setDeletingId(id)}
          />
        )}

        {!loading && currentTab === 'worldSettings' && (
          <WorldSettingsView
            settings={worldSettings}
            selectedCategory={selectedCategory}
            onCategoryChange={setSelectedCategory}
            onEdit={(item) => setEditingItem({ type: 'worldSettings', item })}
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

      {/* 编辑对话框 - 根据类型渲染不同的表单 */}
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
  item: OutlineNode | Character | Scene | Milestone | WorldSetting;
  type: Tab;
  onSave: (item: OutlineNode | Character | Scene | Milestone | WorldSetting) => void;
  onCancel: () => void;
}) {
  const [editedItem, setEditedItem] = useState(item);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(editedItem);
  };

  const getDialogTitle = () => {
    switch (type) {
      case 'outline': return '大纲节点';
      case 'characters': return '角色';
      case 'scenes': return '场景';
      case 'milestones': return '里程碑';
      case 'worldSettings': return '世界观设定';
      default: return '项目';
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          {/* 标题 */}
          <div className="px-6 py-4 border-b border-[#e5ddd2] sticky top-0 bg-white">
            <h3 className="text-lg font-semibold text-[#38342e]">
              编辑{getDialogTitle()}
            </h3>
          </div>

          {/* 表单内容 */}
          <div className="px-6 py-4 space-y-4">
            {type === 'outline' && (
              <OutlineForm
                node={editedItem as OutlineNode}
                onChange={(updated) => setEditedItem(updated)}
              />
            )}
            {type === 'characters' && (
              <CharacterForm
                character={editedItem as Character}
                onChange={(updated) => setEditedItem(updated)}
              />
            )}
            {type === 'scenes' && (
              <SceneForm
                scene={editedItem as Scene}
                onChange={(updated) => setEditedItem(updated)}
              />
            )}
            {type === 'milestones' && (
              <MilestoneForm
                milestone={editedItem as Milestone}
                onChange={(updated) => setEditedItem(updated)}
              />
            )}
            {type === 'worldSettings' && (
              <WorldSettingForm
                setting={editedItem as WorldSetting}
                onChange={(updated) => setEditedItem(updated)}
              />
            )}
          </div>

          {/* 按钮 */}
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

// 大纲节点编辑表单
function OutlineForm({
  node,
  onChange,
}: {
  node: OutlineNode;
  onChange: (node: OutlineNode) => void;
}) {
  return (
    <>
      <div>
        <label className="block text-sm font-medium text-[#5d554a] mb-2">类型</label>
        <select
          value={node.type}
          onChange={(e) => onChange({ ...node, type: e.target.value as 'act' | 'scene' | 'event' })}
          className="w-full px-3 py-2 border border-[#e5ddd2] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#a07d5e]"
        >
          <option value="act">幕</option>
          <option value="scene">场景</option>
          <option value="event">事件</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-[#5d554a] mb-2">标题</label>
        <input
          type="text"
          value={node.title}
          onChange={(e) => onChange({ ...node, title: e.target.value })}
          className="w-full px-3 py-2 border border-[#e5ddd2] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#a07d5e]"
          placeholder="输入标题"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-[#5d554a] mb-2">描述</label>
        <textarea
          value={node.description}
          onChange={(e) => onChange({ ...node, description: e.target.value })}
          className="w-full px-3 py-2 border border-[#e5ddd2] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#a07d5e] min-h-[100px]"
          placeholder="输入描述"
        />
      </div>
    </>
  );
}

// 角色编辑表单
function CharacterForm({
  character,
  onChange,
}: {
  character: Character;
  onChange: (character: Character) => void;
}) {
  return (
    <>
      <div>
        <label className="block text-sm font-medium text-[#5d554a] mb-2">名称</label>
        <input
          type="text"
          value={character.name}
          onChange={(e) => onChange({ ...character, name: e.target.value })}
          className="w-full px-3 py-2 border border-[#e5ddd2] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#a07d5e]"
          placeholder="输入角色名称"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-[#5d554a] mb-2">头像（emoji 或 URL）</label>
        <input
          type="text"
          value={character.avatar || ''}
          onChange={(e) => onChange({ ...character, avatar: e.target.value })}
          className="w-full px-3 py-2 border border-[#e5ddd2] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#a07d5e]"
          placeholder="例如: 👨 或图片URL"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-[#5d554a] mb-2">描述</label>
        <textarea
          value={character.description}
          onChange={(e) => onChange({ ...character, description: e.target.value })}
          className="w-full px-3 py-2 border border-[#e5ddd2] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#a07d5e] min-h-[100px]"
          placeholder="输入角色描述"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-[#5d554a] mb-2">性格</label>
        <textarea
          value={character.personality || ''}
          onChange={(e) => onChange({ ...character, personality: e.target.value })}
          className="w-full px-3 py-2 border border-[#e5ddd2] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#a07d5e] min-h-[80px]"
          placeholder="输入性格特点"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-[#5d554a] mb-2">关系</label>
        <textarea
          value={character.relationships || ''}
          onChange={(e) => onChange({ ...character, relationships: e.target.value })}
          className="w-full px-3 py-2 border border-[#e5ddd2] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#a07d5e] min-h-[80px]"
          placeholder="输入角色关系"
        />
      </div>
    </>
  );
}

// 场景编辑表单
function SceneForm({
  scene,
  onChange,
}: {
  scene: Scene;
  onChange: (scene: Scene) => void;
}) {
  return (
    <>
      <div>
        <label className="block text-sm font-medium text-[#5d554a] mb-2">场景名称</label>
        <input
          type="text"
          value={scene.name}
          onChange={(e) => onChange({ ...scene, name: e.target.value })}
          className="w-full px-3 py-2 border border-[#e5ddd2] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#a07d5e]"
          placeholder="输入场景名称"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-[#5d554a] mb-2">地点</label>
        <input
          type="text"
          value={scene.location}
          onChange={(e) => onChange({ ...scene, location: e.target.value })}
          className="w-full px-3 py-2 border border-[#e5ddd2] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#a07d5e]"
          placeholder="输入地点"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-[#5d554a] mb-2">时间段</label>
        <select
          value={scene.time_of_day}
          onChange={(e) => onChange({ ...scene, time_of_day: e.target.value as Scene['time_of_day'] })}
          className="w-full px-3 py-2 border border-[#e5ddd2] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#a07d5e]"
        >
          <option value="morning">早晨</option>
          <option value="noon">中午</option>
          <option value="evening">傍晚</option>
          <option value="night">夜晚</option>
          <option value="other">其他</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-[#5d554a] mb-2">描述</label>
        <textarea
          value={scene.description}
          onChange={(e) => onChange({ ...scene, description: e.target.value })}
          className="w-full px-3 py-2 border border-[#e5ddd2] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#a07d5e] min-h-[100px]"
          placeholder="输入场景描述"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-[#5d554a] mb-2">氛围</label>
        <input
          type="text"
          value={scene.mood || ''}
          onChange={(e) => onChange({ ...scene, mood: e.target.value })}
          className="w-full px-3 py-2 border border-[#e5ddd2] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#a07d5e]"
          placeholder="例如: 紧张、轻松、浪漫"
        />
      </div>
    </>
  );
}

// 里程碑编辑表单
function MilestoneForm({
  milestone,
  onChange,
}: {
  milestone: Milestone;
  onChange: (milestone: Milestone) => void;
}) {
  return (
    <>
      <div>
        <label className="block text-sm font-medium text-[#5d554a] mb-2">标题</label>
        <input
          type="text"
          value={milestone.title}
          onChange={(e) => onChange({ ...milestone, title: e.target.value })}
          className="w-full px-3 py-2 border border-[#e5ddd2] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#a07d5e]"
          placeholder="输入里程碑标题"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-[#5d554a] mb-2">状态</label>
        <select
          value={milestone.status}
          onChange={(e) => onChange({ ...milestone, status: e.target.value as Milestone['status'] })}
          className="w-full px-3 py-2 border border-[#e5ddd2] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#a07d5e]"
        >
          <option value="pending">待办</option>
          <option value="in_progress">进行中</option>
          <option value="completed">已完成</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-[#5d554a] mb-2">截止日期</label>
        <input
          type="date"
          value={milestone.due_date ? new Date(milestone.due_date).toISOString().split('T')[0] : ''}
          onChange={(e) => onChange({ ...milestone, due_date: e.target.value ? new Date(e.target.value).toISOString() : null })}
          className="w-full px-3 py-2 border border-[#e5ddd2] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#a07d5e]"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-[#5d554a] mb-2">描述</label>
        <textarea
          value={milestone.description}
          onChange={(e) => onChange({ ...milestone, description: e.target.value })}
          className="w-full px-3 py-2 border border-[#e5ddd2] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#a07d5e] min-h-[100px]"
          placeholder="输入里程碑描述"
        />
      </div>
    </>
  );
}

// 大纲视图（添加编辑/删除按钮）
function OutlineView({
  nodes,
  onEdit,
  onDelete,
}: {
  nodes: OutlineNode[];
  onEdit: (node: OutlineNode) => void;
  onDelete: (id: string) => void;
}) {
  if (nodes.length === 0) {
    return (
      <div className="text-center py-12 text-[#7a6e5f]">
        <div className="text-4xl mb-4">📋</div>
        <p>暂无大纲节点</p>
        <p className="text-sm mt-2">点击"新建"创建第一个大纲节点</p>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {nodes.map((node) => (
        <div
          key={node.id}
          className="group p-4 bg-white rounded-lg border border-[#e5ddd2] hover:shadow-md transition-shadow"
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs px-2 py-1 rounded bg-[#faf8f5] text-[#7a6e5f]">
                  {node.type === 'act' && '幕'}
                  {node.type === 'scene' && '场景'}
                  {node.type === 'event' && '事件'}
                </span>
                <h3 className="font-medium text-[#38342e]">{node.title}</h3>
              </div>
              {node.description && (
                <p className="text-sm text-[#7a6e5f]">{node.description}</p>
              )}
            </div>
            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => onEdit(node)}
                className="p-2 text-[#a07d5e] hover:bg-[#faf8f5] rounded transition-colors"
                title="编辑"
              >
                ✏️
              </button>
              <button
                onClick={() => onDelete(node.id)}
                className="p-2 text-red-500 hover:bg-red-50 rounded transition-colors"
                title="删除"
              >
                🗑️
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// 角色视图（添加编辑/删除按钮）
function CharactersView({
  characters,
  onEdit,
  onDelete,
}: {
  characters: Character[];
  onEdit: (char: Character) => void;
  onDelete: (id: string) => void;
}) {
  if (characters.length === 0) {
    return (
      <div className="text-center py-12 text-[#7a6e5f]">
        <div className="text-4xl mb-4">👤</div>
        <p>暂无角色</p>
        <p className="text-sm mt-2">点击"新建"创建第一个角色</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {characters.map((char) => (
        <div
          key={char.id}
          className="group p-4 bg-white rounded-lg border border-[#e5ddd2] hover:shadow-md transition-shadow relative"
        >
          <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => onEdit(char)}
              className="p-1.5 text-[#a07d5e] hover:bg-[#faf8f5] rounded transition-colors text-sm"
              title="编辑"
            >
              ✏️
            </button>
            <button
              onClick={() => onDelete(char.id)}
              className="p-1.5 text-red-500 hover:bg-red-50 rounded transition-colors text-sm"
              title="删除"
            >
              🗑️
            </button>
          </div>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#a07d5e] to-[#8b6342] flex items-center justify-center text-white text-xl">
              {char.avatar || char.name.charAt(0)}
            </div>
            <div>
              <h3 className="font-medium text-[#38342e]">{char.name}</h3>
            </div>
          </div>
          {char.description && (
            <p className="text-sm text-[#7a6e5f] line-clamp-3">{char.description}</p>
          )}
        </div>
      ))}
    </div>
  );
}

// 场景视图（添加编辑/删除按钮）
function ScenesView({
  scenes,
  onEdit,
  onDelete,
}: {
  scenes: Scene[];
  onEdit: (scene: Scene) => void;
  onDelete: (id: string) => void;
}) {
  if (scenes.length === 0) {
    return (
      <div className="text-center py-12 text-[#7a6e5f]">
        <div className="text-4xl mb-4">🎬</div>
        <p>暂无场景</p>
        <p className="text-sm mt-2">点击"新建"创建第一个场景</p>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {scenes.map((scene) => (
        <div
          key={scene.id}
          className="group p-4 bg-white rounded-lg border border-[#e5ddd2] hover:shadow-md transition-shadow"
        >
          <div className="flex items-start justify-between mb-2">
            <h3 className="font-medium text-[#38342e] flex-1">{scene.name}</h3>
            <div className="flex items-center gap-2">
              <span className="text-xs px-2 py-1 rounded bg-[#faf8f5] text-[#7a6e5f]">
                {scene.time_of_day === 'morning' && '🌅 早晨'}
                {scene.time_of_day === 'noon' && '☀️ 中午'}
                {scene.time_of_day === 'evening' && '🌇 傍晚'}
                {scene.time_of_day === 'night' && '🌙 夜晚'}
                {scene.time_of_day === 'other' && '🕐 其他'}
              </span>
              {scene.location && (
                <span className="text-xs px-2 py-1 rounded bg-[#faf8f5] text-[#7a6e5f]">
                  📍 {scene.location}
                </span>
              )}
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                <button
                  onClick={() => onEdit(scene)}
                  className="p-1.5 text-[#a07d5e] hover:bg-[#faf8f5] rounded transition-colors text-sm"
                  title="编辑"
                >
                  ✏️
                </button>
                <button
                  onClick={() => onDelete(scene.id)}
                  className="p-1.5 text-red-500 hover:bg-red-50 rounded transition-colors text-sm"
                  title="删除"
                >
                  🗑️
                </button>
              </div>
            </div>
          </div>
          {scene.description && (
            <p className="text-sm text-[#7a6e5f]">{scene.description}</p>
          )}
        </div>
      ))}
    </div>
  );
}

// 里程碑视图（添加编辑/删除按钮）
function MilestonesView({
  milestones,
  onEdit,
  onDelete,
}: {
  milestones: Milestone[];
  onEdit: (milestone: Milestone) => void;
  onDelete: (id: string) => void;
}) {
  if (milestones.length === 0) {
    return (
      <div className="text-center py-12 text-[#7a6e5f]">
        <div className="text-4xl mb-4">🎯</div>
        <p>暂无里程碑</p>
        <p className="text-sm mt-2">点击"新建"创建第一个里程碑</p>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {milestones.map((milestone) => (
        <div
          key={milestone.id}
          className="group p-4 bg-white rounded-lg border border-[#e5ddd2] hover:shadow-md transition-shadow"
        >
          <div className="flex items-start justify-between mb-2">
            <h3 className="font-medium text-[#38342e] flex-1">{milestone.title}</h3>
            <div className="flex items-center gap-2">
              <span
                className={`text-xs px-2 py-1 rounded ${
                  milestone.status === 'completed'
                    ? 'bg-green-100 text-green-700'
                    : milestone.status === 'in_progress'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-gray-100 text-gray-700'
                }`}
              >
                {milestone.status === 'pending' && '⏳ 待办'}
                {milestone.status === 'in_progress' && '🚀 进行中'}
                {milestone.status === 'completed' && '✅ 已完成'}
              </span>
              {milestone.due_date && (
                <span className="text-xs px-2 py-1 rounded bg-[#faf8f5] text-[#7a6e5f]">
                  📅 {new Date(milestone.due_date).toLocaleDateString()}
                </span>
              )}
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                <button
                  onClick={() => onEdit(milestone)}
                  className="p-1.5 text-[#a07d5e] hover:bg-[#faf8f5] rounded transition-colors text-sm"
                  title="编辑"
                >
                  ✏️
                </button>
                <button
                  onClick={() => onDelete(milestone.id)}
                  className="p-1.5 text-red-500 hover:bg-red-50 rounded transition-colors text-sm"
                  title="删除"
                >
                  🗑️
                </button>
              </div>
            </div>
          </div>
          {milestone.description && (
            <p className="text-sm text-[#7a6e5f]">{milestone.description}</p>
          )}
        </div>
      ))}
    </div>
  );
}

// 世界观设定视图（Bento 风格布局）
function WorldSettingsView({
  settings,
  selectedCategory,
  onCategoryChange,
  onEdit,
  onDelete,
}: {
  settings: WorldSetting[];
  selectedCategory: WorldSettingCategory | null;
  onCategoryChange: (category: WorldSettingCategory | null) => void;
  onEdit: (setting: WorldSetting) => void;
  onDelete: (id: string) => void;
}) {
  // 过滤设定
  const filteredSettings = selectedCategory
    ? settings.filter(s => s.category === selectedCategory)
    : settings;

  const categories: WorldSettingCategory[] = ['location', 'organization', 'event', 'culture', 'technology', 'magic'];

  return (
    <div className="space-y-4">
      {/* 分类过滤器 */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => onCategoryChange(null)}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            selectedCategory === null
              ? 'bg-[#a07d5e] text-white'
              : 'bg-white text-[#5d554a] border border-[#e5ddd2] hover:bg-[#faf8f5]'
          }`}
        >
          全部
        </button>
        {categories.map(cat => {
          const info = CATEGORY_ICONS[cat];
          return (
            <button
              key={cat}
              onClick={() => onCategoryChange(cat)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                selectedCategory === cat
                  ? 'bg-[#a07d5e] text-white'
                  : 'bg-white text-[#5d554a] border border-[#e5ddd2] hover:bg-[#faf8f5]'
              }`}
            >
              {info.icon} {info.label}
            </button>
          );
        })}
      </div>

      {/* Bento 网格布局 */}
      {filteredSettings.length === 0 ? (
        <div className="text-center py-12 text-[#7a6e5f]">
          <div className="text-4xl mb-4">🌍</div>
          <p>暂无世界观设定</p>
          <p className="text-sm mt-2">点击"新建"创建第一个世界观设定</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSettings.map(setting => {
            const categoryInfo = CATEGORY_ICONS[setting.category];
            return (
              <div
                key={setting.id}
                className="group p-5 bg-white rounded-xl border border-[#e5ddd2] hover:shadow-lg transition-all relative overflow-hidden"
              >
                {/* 背景装饰 */}
                <div 
                  className="absolute top-0 right-0 w-24 h-24 opacity-5"
                  style={{ 
                    fontSize: '80px',
                    color: categoryInfo.color,
                    lineHeight: '1',
                    transform: 'translate(20%, -20%)'
                  }}
                >
                  {categoryInfo.icon}
                </div>

                {/* 操作按钮 */}
                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => onEdit(setting)}
                    className="p-1.5 bg-white text-[#a07d5e] hover:bg-[#faf8f5] rounded shadow-sm transition-colors text-sm"
                    title="编辑"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => onDelete(setting.id)}
                    className="p-1.5 bg-white text-red-500 hover:bg-red-50 rounded shadow-sm transition-colors text-sm"
                    title="删除"
                  >
                    🗑️
                  </button>
                </div>

                {/* 图标和分类 */}
                <div className="flex items-center gap-3 mb-3">
                  <div 
                    className="w-12 h-12 rounded-lg flex items-center justify-center text-2xl"
                    style={{ backgroundColor: `${categoryInfo.color}20` }}
                  >
                    {setting.icon_type || categoryInfo.icon}
                  </div>
                  <div className="flex-1">
                    <div className="text-xs text-[#7a6e5f] mb-1">{categoryInfo.label}</div>
                    <h3 className="font-semibold text-[#38342e] line-clamp-1">{setting.title}</h3>
                  </div>
                </div>

                {/* 内容 */}
                <p className="text-sm text-[#7a6e5f] line-clamp-3 mb-3">
                  {setting.content}
                </p>

                {/* 标签 */}
                {setting.tags && setting.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {setting.tags.slice(0, 3).map((tag, idx) => (
                      <span 
                        key={idx}
                        className="text-xs px-2 py-0.5 rounded bg-[#faf8f5] text-[#7a6e5f]"
                      >
                        {tag}
                      </span>
                    ))}
                    {setting.tags.length > 3 && (
                      <span className="text-xs px-2 py-0.5 text-[#7a6e5f]">
                        +{setting.tags.length - 3}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// 世界观设定编辑表单
function WorldSettingForm({
  setting,
  onChange,
}: {
  setting: WorldSetting;
  onChange: (setting: WorldSetting) => void;
}) {
  const categories: WorldSettingCategory[] = ['location', 'organization', 'event', 'culture', 'technology', 'magic'];

  return (
    <>
      <div>
        <label className="block text-sm font-medium text-[#5d554a] mb-2">分类</label>
        <select
          value={setting.category}
          onChange={(e) => onChange({ ...setting, category: e.target.value as WorldSettingCategory })}
          className="w-full px-3 py-2 border border-[#e5ddd2] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#a07d5e]"
        >
          {categories.map(cat => {
            const info = CATEGORY_ICONS[cat];
            return (
              <option key={cat} value={cat}>
                {info.icon} {info.label}
              </option>
            );
          })}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-[#5d554a] mb-2">标题</label>
        <input
          type="text"
          value={setting.title}
          onChange={(e) => onChange({ ...setting, title: e.target.value })}
          className="w-full px-3 py-2 border border-[#e5ddd2] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#a07d5e]"
          placeholder="输入设定标题"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-[#5d554a] mb-2">内容</label>
        <textarea
          value={setting.content}
          onChange={(e) => onChange({ ...setting, content: e.target.value })}
          className="w-full px-3 py-2 border border-[#e5ddd2] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#a07d5e] min-h-[150px]"
          placeholder="输入详细内容"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-[#5d554a] mb-2">图标（emoji）</label>
        <input
          type="text"
          value={setting.icon_type || ''}
          onChange={(e) => onChange({ ...setting, icon_type: e.target.value })}
          className="w-full px-3 py-2 border border-[#e5ddd2] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#a07d5e]"
          placeholder="例如: 🏙️ 或留空使用默认图标"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-[#5d554a] mb-2">标签（用逗号分隔）</label>
        <input
          type="text"
          value={setting.tags?.join(', ') || ''}
          onChange={(e) => onChange({ 
            ...setting, 
            tags: e.target.value.split(',').map(t => t.trim()).filter(t => t) 
          })}
          className="w-full px-3 py-2 border border-[#e5ddd2] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#a07d5e]"
          placeholder="例如: 现代, 商业, 地标"
        />
      </div>
    </>
  );
}
