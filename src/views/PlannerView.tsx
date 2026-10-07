/**
 * PlannerView - 规划视图组件（完整重构版本）
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
 * 3. 场景管理 - 场景卡片
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
 * 1. 所有数据操作都带 loading 状态，防止重复提交
 * 2. 删除操作需要确认，防止误删
 * 3. 编辑表单使用受控组件，确保数据同步
 * 4. useCallback 用于事件处理函数，优化性能
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { OutlineNode, Scene, Milestone, Character } from '../types/storage';
import { getOutlineNodesByWorkId, createOutlineNode, updateOutlineNode, deleteOutlineNode } from '../services/outlineService';
import { getScenesByWorkId, createScene, updateScene, deleteScene } from '../services/sceneService';
import { getMilestonesByWorkId, createMilestone, updateMilestone, deleteMilestone } from '../services/milestoneService';
import { getWorks } from '../services/workService';
import { getChaptersByWorkId, createChapter } from '../services/chapterService';
import { getCharactersByWorkId, createCharacter, updateCharacter, deleteCharacter } from '../services/characterService';
import { useWriterStore } from '../stores/writerStore';
import type { Work } from '../types/storage';
import {
  aiChatStream,
  aiCancel,
  buildOutlineMessages,
  parseOutlineText,
  type ParsedOutlineChapter,
} from '../services/aiService';
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
  const [works, setWorks] = useState<Work[]>([]);
  const [currentTab, setCurrentTab] = useState<Tab>('outline');
  const [loading, setLoading] = useState(false);

  // 数据状态
  const [outlineNodes, setOutlineNodes] = useState<OutlineNode[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [worldSettings, setWorldSettings] = useState<WorldSetting[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<WorldSettingCategory | null>(null);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());

  // UI 状态
  const [editingItem, setEditingItem] = useState<EditingItem>(null);
  const [deletingItem, setDeletingItem] = useState<{ id: string; title: string; childCount: number } | null>(null);
  const { showToast, ToastComponent } = useToast();

  // 概览统计
  const [chapterCount, setChapterCount] = useState(0);
  const [totalWords, setTotalWords] = useState<number | null>(null);

  // AI 大纲生成
  const [aiOutlineOpen, setAiOutlineOpen] = useState(false);
  const [aiPremise, setAiPremise] = useState('');
  const [aiChapterCount, setAiChapterCount] = useState(10);
  const [aiOutput, setAiOutput] = useState('');
  const [aiRunning, setAiRunning] = useState(false);
  const [aiParsed, setAiParsed] = useState<ParsedOutlineChapter[]>([]);
  const [aiApplying, setAiApplying] = useState(false);
  const aiRequestRef = useRef<string | null>(null);

  // 与全局当前作品保持一致（创作视图切换作品后这里自动跟随）
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

  /** 切换作品：更新本视图并同步全局 store，创作/导演视图随之跟随 */
  const handleWorkChange = useCallback(async (workId: string) => {
    setCurrentWorkId(workId);
    useWriterStore.getState().setCurrentWorkId(workId);
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

      // 概览统计：章节数与总字数
      getChaptersByWorkId(currentWorkId)
        .then((chs) => {
          setChapterCount(chs.length);
          const words = chs.reduce(
            (sum, c) => sum + (c.content.replace(/<[^>]*>/g, '').replace(/\s/g, '').length),
            0
          );
          setTotalWords(words);
        })
        .catch(() => undefined);
    } catch (error) {
      showToast('加载数据失败', 'error');
      console.error('加载失败:', error);
    } finally {
      setLoading(false);
    }
  }, [currentWorkId, showToast]);

  // 性能优化：只重新加载当前tab的数据
  const reloadCurrentTab = useCallback(async () => {    if (!currentWorkId) return;

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

  // 构建大纲树（孤儿节点提升为顶层），供快速创建与树形操作使用
  const outlineTree = useMemo(() => buildOutlineTree(outlineNodes), [outlineNodes]);

  // 快速创建项
  const handleQuickCreate = useCallback(async () => {
    if (!currentWorkId || loading) return;

    setLoading(true);
    try {
      switch (currentTab) {
        case 'outline':
          // 根节点：幕（Act）
          await createOutlineNode({
            work_id: currentWorkId,
            parent_id: null,
            title: '新幕',
            description: '',
            order: outlineTree.length,
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
  }, [currentWorkId, currentTab, loading, outlineTree, selectedCategory, reloadCurrentTab, showToast]);

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
    if (!deletingItem) return;

    setLoading(true);
    try {
      switch (currentTab) {
        case 'outline':
          // 大纲节点级联软删除（先收集全部后代，再逐个删除）
          await deleteOutlineNodeCascade(deletingItem.id, outlineNodes);
          showToast(`大纲节点已删除（含 ${deletingItem.childCount} 个子节点）`, 'success');
          break;
        case 'characters':
          await deleteCharacter(deletingItem.id);
          showToast('角色已删除', 'success');
          break;
        case 'scenes':
          await deleteScene(deletingItem.id);
          showToast('场景已删除', 'success');
          break;
        case 'milestones':
          await deleteMilestone(deletingItem.id);
          showToast('里程碑已删除', 'success');
          break;
        case 'worldSettings':
          await deleteWorldSetting(deletingItem.id);
          showToast('世界观设定已删除', 'success');
          break;
      }

      setDeletingItem(null);
      await reloadCurrentTab();
    } catch (error) {
      showToast('删除失败', 'error');
      console.error('删除失败:', error);
    } finally {
      setLoading(false);
    }
  }, [deletingItem, currentTab, outlineNodes, reloadCurrentTab, showToast]);

  // ==========================================================================
  // 大纲树操作
  // ==========================================================================

  /** 在指定节点下新建子节点（类型自动下探：幕→场景→事件） */
  const handleAddChild = useCallback(async (parent: OutlineNode) => {
    if (!currentWorkId) return;
    const childType = parent.type === 'act' ? 'scene' : 'event';
    const childCount = countDescendants(parent.id, outlineTree);
    try {
      await createOutlineNode({
        work_id: currentWorkId,
        parent_id: parent.id,
        title: childType === 'scene' ? '新场景节点' : '新事件节点',
        description: '',
        order: childCount,
        type: childType,
      });
      // 确保父节点处于展开状态
      setCollapsedIds((prev) => {
        if (!prev.has(parent.id)) return prev;
        const next = new Set(prev);
        next.delete(parent.id);
        return next;
      });
      showToast('子节点创建成功', 'success');
      await reloadCurrentTab();
    } catch (error) {
      showToast('创建失败', 'error');
      console.error(error);
    }
  }, [currentWorkId, outlineTree, reloadCurrentTab, showToast]);

  /** 同级排序：与相邻节点交换 order 值 */
  /** 大纲节点一键转为章节（描述作为正文首段），创作视图立即可见 */
  const handleNodeToChapter = useCallback(async (node: OutlineNode) => {
    if (!currentWorkId) return;
    try {
      const existing = await getChaptersByWorkId(currentWorkId);
      await createChapter(
        currentWorkId,
        node.title,
        node.description ? '<p>' + node.description + '</p>' : '',
        existing.length + 1
      );

      // 若创作视图正打开同一作品，刷新其章节列表使新章节立即可见
      const store = useWriterStore.getState();
      if (store.currentWorkId === currentWorkId) {
        store.setChapters(await getChaptersByWorkId(currentWorkId));
      }

      showToast('已创建章节「' + node.title + '」', 'success');
    } catch (error: any) {
      showToast(error.message || '转章节失败', 'error');
      console.error(error);
    }
  }, [currentWorkId, showToast]);

  const handleMoveNode = useCallback(async (node: OutlineNode, direction: -1 | 1) => {    const siblings = findSiblings(node, outlineTree);
    const index = siblings.findIndex((s) => s.id === node.id);
    const target = siblings[index + direction];
    if (!target) return;
    try {
      await updateOutlineNode(node.id, { order: target.order });
      await updateOutlineNode(target.id, { order: node.order });
      await reloadCurrentTab();
    } catch (error) {
      showToast('排序失败', 'error');
      console.error(error);
    }
  }, [outlineTree, reloadCurrentTab, showToast]);

  // ==========================================================================
  // AI 大纲生成
  // ==========================================================================

  /** 流式生成大纲并解析为章节列表 */
  const handleAiGenerateOutline = useCallback(async () => {
    if (!currentWorkId) return;
    if (!aiPremise.trim()) {
      showToast('请先输入一句话创意', 'warning');
      return;
    }

    setAiRunning(true);
    setAiOutput('');
    setAiParsed([]);

    let accumulated = '';
    try {
      const { loadConfig } = await import('../services/configService');
      const config = (await loadConfig()).ai;
      if (!config.baseUrl || !config.model) {
        showToast('请先在设置中配置 AI 服务', 'warning');
        setAiRunning(false);
        return;
      }
      await new Promise<string>((resolve, reject) => {
        aiChatStream(config, buildOutlineMessages(aiPremise.trim(), aiChapterCount), {
          onDelta: (delta) => {
            accumulated += delta;
            setAiOutput(accumulated);
          },
          onError: (message) => reject(new Error(message)),
        }).then(resolve).catch(reject);
      });
      const parsed = parseOutlineText(accumulated);
      setAiParsed(parsed);
      if (parsed.length === 0) {
        showToast('未能从 AI 输出中解析出章节大纲，请重试', 'warning');
      } else {
        showToast('解析出 ' + parsed.length + ' 章大纲', 'success');
      }
    } catch (error: any) {
      const parsed = parseOutlineText(accumulated);
      setAiParsed(parsed);
      if (parsed.length === 0) {
        showToast(error.message || 'AI 请求失败', 'error');
      }
    } finally {
      setAiRunning(false);
      aiRequestRef.current = null;
    }
  }, [currentWorkId, aiPremise, aiChapterCount, showToast]);

  /** 停止生成 */
  const handleAiStop = useCallback(() => {
    if (aiRequestRef.current) {
      aiCancel(aiRequestRef.current);
    }
    setAiRunning(false);
  }, []);

  /** 将解析结果应用为大纲树（一个幕 + N 个场景节点） */
  const handleAiApply = useCallback(async () => {
    if (!currentWorkId || aiParsed.length === 0) return;
    setAiApplying(true);
    try {
      const act = await createOutlineNode({
        work_id: currentWorkId,
        parent_id: null,
        title: 'AI 大纲：' + aiPremise.trim().slice(0, 20),
        description: aiPremise.trim(),
        order: outlineTree.length,
        type: 'act',
      });
      for (let i = 0; i < aiParsed.length; i++) {
        await createOutlineNode({
          work_id: currentWorkId,
          parent_id: act.id,
          title: '第' + (i + 1) + '章 ' + aiParsed[i].title,
          description: aiParsed[i].description,
          order: i,
          type: 'scene',
        });
      }
      showToast('已创建 1 幕 + ' + aiParsed.length + ' 个章节节点', 'success');
      setAiOutlineOpen(false);
      setAiParsed([]);
      setAiOutput('');
      setAiPremise('');
      await reloadCurrentTab();
    } catch (error: any) {
      showToast(error.message || '应用失败', 'error');
    } finally {
      setAiApplying(false);
    }
  }, [currentWorkId, aiParsed, aiPremise, outlineTree.length, reloadCurrentTab, showToast]);

  /** 里程碑状态快捷切换（点击徽章循环：待办 → 进行中 → 已完成） */  const handleCycleMilestoneStatus = useCallback(async (milestone: Milestone) => {
    const nextStatus =
      milestone.status === 'pending' ? 'in_progress' : milestone.status === 'in_progress' ? 'completed' : 'pending';
    try {
      await updateMilestone(milestone.id, { status: nextStatus });
      setMilestones(
        milestones.map((m) => (m.id === milestone.id ? { ...m, status: nextStatus } : m))
      );
    } catch (error) {
      showToast('状态更新失败', 'error');
      console.error(error);
    }
  }, [milestones, showToast]);

  // 展开/收起节点
  const toggleCollapse = useCallback((id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  return (
    <div className="flex-1 flex flex-col bg-surface-primary overflow-hidden">
      {ToastComponent}

      {/* 确认删除对话框 */}
      {deletingItem && (
        <ConfirmDialog
          title="确认删除"
          message={
            currentTab === 'outline' && deletingItem.childCount > 0
              ? `确定要删除「${deletingItem.title}」吗？其下的 ${deletingItem.childCount} 个子节点也将一并删除，此操作无法撤销。`
              : `确定要删除「${deletingItem.title}」吗？此操作无法撤销。`
          }
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
              onClick={() => setCurrentTab('outline')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                currentTab === 'outline'
                  ? 'bg-primary-500 text-white'
                  : 'text-on-surface-variant hover:bg-on-surface-secondary/10'
              }`}
            >
              📋 大纲
            </button>
          <button
            onClick={() => setCurrentTab('characters')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              currentTab === 'characters'
                ? 'bg-primary-500 text-white'
                : 'text-on-surface-variant hover:bg-on-surface-secondary/10'
            }`}
          >
            👤 角色
          </button>
          <button
            onClick={() => setCurrentTab('scenes')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              currentTab === 'scenes'
                ? 'bg-primary-500 text-white'
                : 'text-on-surface-variant hover:bg-on-surface-secondary/10'
            }`}
          >
            🎬 场景
          </button>
          <button
            onClick={() => setCurrentTab('milestones')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              currentTab === 'milestones'
                ? 'bg-primary-500 text-white'
                : 'text-on-surface-variant hover:bg-on-surface-secondary/10'
            }`}
          >
            🎯 里程碑
          </button>
          <button
            onClick={() => setCurrentTab('worldSettings')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              currentTab === 'worldSettings'
                ? 'bg-primary-500 text-white'
                : 'text-on-surface-variant hover:bg-on-surface-secondary/10'
            }`}
          >
            🌍 世界观
          </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {currentTab === 'outline' && (
            <button
              onClick={() => setAiOutlineOpen(true)}
              disabled={!currentWorkId || loading}
              className="px-4 py-2 border border-primary-400 text-primary-600 rounded-lg text-sm font-medium hover:bg-primary-50 transition-colors disabled:opacity-50"
              title="从一句话创意生成章节大纲"
            >
              ✨ AI 大纲
            </button>
          )}
          <button
            onClick={handleQuickCreate}
            disabled={loading || !currentWorkId}
            className="px-4 py-2 bg-primary-500 text-white rounded-lg text-sm font-medium hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? '处理中...' : '+ 新建'}
          </button>
        </div>
      </div>

      {/* 概览统计条 */}
      {currentWorkId && (
        <div className="flex items-center gap-5 px-6 py-2 text-xs text-on-surface-secondary border-b border-outline bg-surface-secondary">
          <span>📋 大纲 {outlineNodes.length}</span>
          <span>📖 章节 {chapterCount}</span>
          {totalWords !== null && <span>✍️ 字数 {totalWords.toLocaleString()}</span>}
          <span>👤 角色 {characters.length}</span>
          <span>🎬 场景 {scenes.length}</span>
          <span>🎯 里程碑 {milestones.filter((m) => m.status === 'completed').length}/{milestones.length}</span>
        </div>
      )}

      {/* 内容区域 */}
      <div className="flex-1 overflow-auto p-6">
        {loading && (
          <div className="flex items-center justify-center h-32">
            <div className="text-on-surface-secondary">加载中...</div>
          </div>
        )}

        {!loading && currentTab === 'outline' && (
          <OutlineTreeView
            tree={outlineTree}
            collapsedIds={collapsedIds}
            onToggleCollapse={toggleCollapse}
            onEdit={(item) => setEditingItem({ type: 'outline', item })}
            onDelete={(node) => setDeletingItem({
              id: node.id,
              title: node.title,
              childCount: countDescendants(node.id, outlineTree),
            })}
            onAddChild={handleAddChild}
            onMove={handleMoveNode}
            onToChapter={handleNodeToChapter}
          />
        )}

        {!loading && currentTab === 'characters' && (
          <CharactersView
            characters={characters}
            onEdit={(item) => setEditingItem({ type: 'characters', item })}
            onDelete={(id) => {
              const c = characters.find((x) => x.id === id);
              setDeletingItem({ id, title: c?.name || '角色', childCount: 0 });
            }}
          />
        )}

        {!loading && currentTab === 'scenes' && (
          <ScenesView
            scenes={scenes}
            onEdit={(item) => setEditingItem({ type: 'scenes', item })}
            onDelete={(id) => {
              const s = scenes.find((x) => x.id === id);
              setDeletingItem({ id, title: s?.name || '场景', childCount: 0 });
            }}
          />
        )}

        {!loading && currentTab === 'milestones' && (
          <MilestonesView
            milestones={milestones}
            onEdit={(item) => setEditingItem({ type: 'milestones', item })}
            onDelete={(id) => {
              const m = milestones.find((x) => x.id === id);
              setDeletingItem({ id, title: m?.title || '里程碑', childCount: 0 });
            }}
            onCycleStatus={handleCycleMilestoneStatus}
          />
        )}

        {!loading && currentTab === 'worldSettings' && (
          <WorldSettingsView
            settings={worldSettings}
            selectedCategory={selectedCategory}
            onCategoryChange={setSelectedCategory}
            onEdit={(item) => setEditingItem({ type: 'worldSettings', item })}
            onDelete={(id) => {
              const w = worldSettings.find((x) => x.id === id);
              setDeletingItem({ id, title: w?.title || '世界观设定', childCount: 0 });
            }}
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

      {/* 编辑对话框 - 根据类型渲染不同的表单 */}
      {editingItem && (
        <EditDialog
          item={editingItem.item}
          type={editingItem.type}
          onSave={handleSaveEdit}
          onCancel={() => setEditingItem(null)}
        />
      )}

      {/* AI 大纲生成对话框 */}
      {aiOutlineOpen && (
        <AiOutlineDialog
          premise={aiPremise}
          setPremise={setAiPremise}
          chapterCount={aiChapterCount}
          setChapterCount={setAiChapterCount}
          output={aiOutput}
          running={aiRunning}
          parsed={aiParsed}
          applying={aiApplying}
          onGenerate={handleAiGenerateOutline}
          onStop={handleAiStop}
          onApply={handleAiApply}
          onClose={() => {
            if (aiRunning) handleAiStop();
            setAiOutlineOpen(false);
          }}
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
      <div className="bg-surface-secondary rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          {/* 标题 */}
          <div className="px-6 py-4 border-b border-outline sticky top-0 bg-surface-primary">
            <h3 className="text-lg font-semibold text-on-surface">
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
        <label className="block text-sm font-medium text-on-surface-variant mb-2">类型</label>
        <select
          value={node.type}
          onChange={(e) => onChange({ ...node, type: e.target.value as 'act' | 'scene' | 'event' })}
          className="w-full px-3 py-2 border border-outline rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="act">幕</option>
          <option value="scene">场景</option>
          <option value="event">事件</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-on-surface-variant mb-2">标题</label>
        <input
          type="text"
          value={node.title}
          onChange={(e) => onChange({ ...node, title: e.target.value })}
          className="w-full px-3 py-2 border border-outline rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          placeholder="输入标题"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-on-surface-variant mb-2">描述</label>
        <textarea
          value={node.description}
          onChange={(e) => onChange({ ...node, description: e.target.value })}
          className="w-full px-3 py-2 border border-outline rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 min-h-[100px]"
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
        <label className="block text-sm font-medium text-on-surface-variant mb-2">名称</label>
        <input
          type="text"
          value={character.name}
          onChange={(e) => onChange({ ...character, name: e.target.value })}
          className="w-full px-3 py-2 border border-outline rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          placeholder="输入角色名称"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-on-surface-variant mb-2">头像（emoji 或 URL）</label>
        <input
          type="text"
          value={character.avatar || ''}
          onChange={(e) => onChange({ ...character, avatar: e.target.value })}
          className="w-full px-3 py-2 border border-outline rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          placeholder="例如: 👨 或图片URL"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-on-surface-variant mb-2">描述</label>
        <textarea
          value={character.description}
          onChange={(e) => onChange({ ...character, description: e.target.value })}
          className="w-full px-3 py-2 border border-outline rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 min-h-[100px]"
          placeholder="输入角色描述"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-on-surface-variant mb-2">性格</label>
        <textarea
          value={character.personality || ''}
          onChange={(e) => onChange({ ...character, personality: e.target.value })}
          className="w-full px-3 py-2 border border-outline rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 min-h-[80px]"
          placeholder="输入性格特点"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-on-surface-variant mb-2">关系</label>
        <textarea
          value={character.relationships || ''}
          onChange={(e) => onChange({ ...character, relationships: e.target.value })}
          className="w-full px-3 py-2 border border-outline rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 min-h-[80px]"
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
        <label className="block text-sm font-medium text-on-surface-variant mb-2">场景名称</label>
        <input
          type="text"
          value={scene.name}
          onChange={(e) => onChange({ ...scene, name: e.target.value })}
          className="w-full px-3 py-2 border border-outline rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          placeholder="输入场景名称"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-on-surface-variant mb-2">地点</label>
        <input
          type="text"
          value={scene.location}
          onChange={(e) => onChange({ ...scene, location: e.target.value })}
          className="w-full px-3 py-2 border border-outline rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          placeholder="输入地点"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-on-surface-variant mb-2">时间段</label>
        <select
          value={scene.time_of_day}
          onChange={(e) => onChange({ ...scene, time_of_day: e.target.value as Scene['time_of_day'] })}
          className="w-full px-3 py-2 border border-outline rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="morning">早晨</option>
          <option value="noon">中午</option>
          <option value="evening">傍晚</option>
          <option value="night">夜晚</option>
          <option value="other">其他</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-on-surface-variant mb-2">描述</label>
        <textarea
          value={scene.description}
          onChange={(e) => onChange({ ...scene, description: e.target.value })}
          className="w-full px-3 py-2 border border-outline rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 min-h-[100px]"
          placeholder="输入场景描述"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-on-surface-variant mb-2">氛围</label>
        <input
          type="text"
          value={scene.mood || ''}
          onChange={(e) => onChange({ ...scene, mood: e.target.value })}
          className="w-full px-3 py-2 border border-outline rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
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
        <label className="block text-sm font-medium text-on-surface-variant mb-2">标题</label>
        <input
          type="text"
          value={milestone.title}
          onChange={(e) => onChange({ ...milestone, title: e.target.value })}
          className="w-full px-3 py-2 border border-outline rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          placeholder="输入里程碑标题"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-on-surface-variant mb-2">状态</label>
        <select
          value={milestone.status}
          onChange={(e) => onChange({ ...milestone, status: e.target.value as Milestone['status'] })}
          className="w-full px-3 py-2 border border-outline rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="pending">待办</option>
          <option value="in_progress">进行中</option>
          <option value="completed">已完成</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-on-surface-variant mb-2">截止日期</label>
        <input
          type="date"
          value={milestone.due_date ? new Date(milestone.due_date).toISOString().split('T')[0] : ''}
          onChange={(e) => onChange({ ...milestone, due_date: e.target.value ? new Date(e.target.value).toISOString() : null })}
          className="w-full px-3 py-2 border border-outline rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-on-surface-variant mb-2">描述</label>
        <textarea
          value={milestone.description}
          onChange={(e) => onChange({ ...milestone, description: e.target.value })}
          className="w-full px-3 py-2 border border-outline rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 min-h-[100px]"
          placeholder="输入里程碑描述"
        />
      </div>
    </>
  );
}

// 大纲树形视图（支持层级、展开收起、子节点、同级排序）
interface OutlineTreeNode {
  node: OutlineNode;
  children: OutlineTreeNode[];
}

/** 由扁平节点构建大纲树；父节点缺失的孤儿提升为顶层 */
function buildOutlineTree(nodes: OutlineNode[]): OutlineTreeNode[] {
  const map = new Map<string, OutlineTreeNode>();
  for (const n of nodes) map.set(n.id, { node: n, children: [] });

  const roots: OutlineTreeNode[] = [];
  for (const tn of map.values()) {
    const parent = tn.node.parent_id ? map.get(tn.node.parent_id) : undefined;
    if (parent) parent.children.push(tn);
    else roots.push(tn);
  }

  const sortRec = (list: OutlineTreeNode[]) => {
    list.sort((a, b) => a.node.order - b.node.order);
    list.forEach((t) => sortRec(t.children));
  };
  sortRec(roots);
  return roots;
}

/** 统计指定节点在树中的后代数量 */
function countDescendants(id: string, tree: OutlineTreeNode[]): number {
  const find = (list: OutlineTreeNode[]): OutlineTreeNode | null => {
    for (const t of list) {
      if (t.node.id === id) return t;
      const found = find(t.children);
      if (found) return found;
    }
    return null;
  };
  const target = find(tree);
  if (!target) return 0;
  let count = 0;
  const walk = (list: OutlineTreeNode[]) => {
    for (const t of list) {
      count++;
      walk(t.children);
    }
  };
  walk(target.children);
  return count;
}

/** 在树中查找节点所在同级列表 */
function findSiblings(node: OutlineNode, tree: OutlineTreeNode[]): OutlineNode[] {
  const find = (list: OutlineTreeNode[]): OutlineNode[] | null => {
    for (const t of list) {
      if (t.node.id === node.id) return list.map((x) => x.node);
      const found = find(t.children);
      if (found) return found;
    }
    return null;
  };
  return find(tree) || [];
}

/** 级联软删除节点及其全部后代 */
async function deleteOutlineNodeCascade(id: string, nodes: OutlineNode[]): Promise<void> {
  const tree = buildOutlineTree(nodes);
  const ids: string[] = [];
  const find = (list: OutlineTreeNode[]): OutlineTreeNode | null => {
    for (const t of list) {
      if (t.node.id === id) return t;
      const found = find(t.children);
      if (found) return found;
    }
    return null;
  };
  const target = find(tree);
  if (target) {
    const walk = (t: OutlineTreeNode) => {
      ids.push(t.node.id);
      t.children.forEach(walk);
    };
    walk(target);
  } else {
    ids.push(id);
  }
  for (const nodeId of ids) {
    await deleteOutlineNode(nodeId);
  }
}

function OutlineTreeView({
  tree,
  collapsedIds,
  onToggleCollapse,
  onEdit,
  onDelete,
  onAddChild,
  onMove,
  onToChapter,
}: {
  tree: OutlineTreeNode[];
  collapsedIds: Set<string>;
  onToggleCollapse: (id: string) => void;
  onEdit: (node: OutlineNode) => void;
  onDelete: (node: OutlineNode) => void;
  onAddChild: (node: OutlineNode) => void;
  onMove: (node: OutlineNode, direction: -1 | 1) => void;
  onToChapter: (node: OutlineNode) => void;
}) {
  if (tree.length === 0) {
    return (
      <div className="text-center py-12 text-on-surface-secondary">
        <div className="text-4xl mb-4">📋</div>
        <p>暂无大纲节点</p>
        <p className="text-sm mt-2">点击"新建"创建第一幕，或在大纲下逐层搭建故事结构</p>
      </div>
    );
  }

  const renderNodes = (list: OutlineTreeNode[], depth: number) =>
    list.map(({ node, children }) => {
      const collapsed = collapsedIds.has(node.id);
      const typeStyle =
        node.type === 'act'
          ? 'bg-primary-100 text-primary-700 dark:bg-primary-900 dark:text-primary-300'
          : node.type === 'scene'
          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
          : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300';

      return (
        <div key={node.id}>
          <div
            className="group flex items-start gap-2 p-3 bg-surface-secondary rounded-lg border border-outline hover:shadow-md transition-shadow"
            style={{ marginLeft: depth * 24 }}
          >
            {/* 展开/收起 */}
            <button
              onClick={() => onToggleCollapse(node.id)}
              disabled={children.length === 0}
              className={`w-6 h-6 flex items-center justify-center rounded text-on-surface-secondary shrink-0 mt-0.5 ${
                children.length > 0 ? 'hover:bg-surface-tertiary' : 'opacity-0 cursor-default'
              }`}
              title={collapsed ? '展开' : '收起'}
            >
              {collapsed ? '▶' : '▼'}
            </button>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-xs px-2 py-0.5 rounded ${typeStyle}`}>
                  {node.type === 'act' ? '幕' : node.type === 'scene' ? '场景' : '事件'}
                </span>
                {children.length > 0 && (
                  <span className="text-xs text-on-surface-secondary">{children.length} 个子节点</span>
                )}
                <h3 className="font-medium text-on-surface">{node.title}</h3>
              </div>
              {node.description && (
                <p className="text-sm text-on-surface-secondary mt-1">{node.description}</p>
              )}
            </div>

            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              <button onClick={() => onAddChild(node)} className="p-1.5 text-primary-500 hover:bg-surface-primary rounded transition-colors text-sm" title="添加子节点">➕</button>
              <button onClick={() => onToChapter(node)} className="p-1.5 text-primary-500 hover:bg-surface-primary rounded transition-colors text-sm" title="转为章节">📖</button>
              <button onClick={() => onMove(node, -1)} className="p-1.5 text-on-surface-secondary hover:bg-surface-primary rounded transition-colors text-sm" title="上移">↑</button>
              <button onClick={() => onMove(node, 1)} className="p-1.5 text-on-surface-secondary hover:bg-surface-primary rounded transition-colors text-sm" title="下移">↓</button>
              <button onClick={() => onEdit(node)} className="p-1.5 text-primary-500 hover:bg-surface-primary rounded transition-colors text-sm" title="编辑">✏️</button>
              <button onClick={() => onDelete(node)} className="p-1.5 text-red-500 hover:bg-red-50 rounded transition-colors text-sm" title="删除">🗑️</button>
            </div>
          </div>
          {!collapsed && children.length > 0 && (
            <div className="mt-2 space-y-2">{renderNodes(children, depth + 1)}</div>
          )}
        </div>
      );
    });

  return <div className="space-y-2">{renderNodes(tree, 0)}</div>;
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
      <div className="text-center py-12 text-on-surface-secondary">
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
          className="group p-4 bg-surface-secondary rounded-lg border border-outline hover:shadow-md transition-shadow relative"
        >
          <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => onEdit(char)}
              className="p-1.5 text-primary-500 hover:bg-surface-primary rounded transition-colors text-sm"
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
              <h3 className="font-medium text-on-surface">{char.name}</h3>
            </div>
          </div>
          {char.description && (
            <p className="text-sm text-on-surface-secondary line-clamp-3 mb-2">{char.description}</p>
          )}
          {char.personality && (
            <p className="text-xs text-on-surface-secondary line-clamp-2">
              <span className="font-medium text-on-surface">性格：</span>{char.personality}
            </p>
          )}
          {char.relationships && (
            <p className="text-xs text-on-surface-secondary line-clamp-2 mt-1">
              <span className="font-medium text-on-surface">关系：</span>{char.relationships}
            </p>
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
      <div className="text-center py-12 text-on-surface-secondary">
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
          className="group p-4 bg-surface-secondary rounded-lg border border-outline hover:shadow-md transition-shadow"
        >
          <div className="flex items-start justify-between mb-2">
            <h3 className="font-medium text-on-surface flex-1">{scene.name}</h3>
            <div className="flex items-center gap-2">
              <span className="text-xs px-2 py-1 rounded bg-surface-primary text-on-surface-secondary">
                {scene.time_of_day === 'morning' && '🌅 早晨'}
                {scene.time_of_day === 'noon' && '☀️ 中午'}
                {scene.time_of_day === 'evening' && '🌇 傍晚'}
                {scene.time_of_day === 'night' && '🌙 夜晚'}
                {scene.time_of_day === 'other' && '🕐 其他'}
              </span>
              {scene.location && (
                <span className="text-xs px-2 py-1 rounded bg-surface-primary text-on-surface-secondary">
                  📍 {scene.location}
                </span>
              )}
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                <button
                  onClick={() => onEdit(scene)}
                  className="p-1.5 text-primary-500 hover:bg-surface-primary rounded transition-colors text-sm"
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
            <p className="text-sm text-on-surface-secondary">{scene.description}</p>
          )}
        </div>
      ))}
    </div>
  );
}

// 里程碑视图（进度总览 + 状态快捷切换）
function MilestonesView({
  milestones,
  onEdit,
  onDelete,
  onCycleStatus,
}: {
  milestones: Milestone[];
  onEdit: (milestone: Milestone) => void;
  onDelete: (id: string) => void;
  onCycleStatus: (milestone: Milestone) => void;
}) {
  if (milestones.length === 0) {
    return (
      <div className="text-center py-12 text-on-surface-secondary">
        <div className="text-4xl mb-4">🎯</div>
        <p>暂无里程碑</p>
        <p className="text-sm mt-2">点击"新建"创建第一个里程碑</p>
      </div>
    );
  }

  const completed = milestones.filter((m) => m.status === 'completed').length;
  const percent = Math.round((completed / milestones.length) * 100);
  const now = Date.now();

  return (
    <div className="space-y-4">
      {/* 进度总览 */}
      <div className="p-4 bg-surface-secondary rounded-lg border border-outline">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-on-surface">
            创作进度：{completed} / {milestones.length} 已完成
          </span>
          <span className="text-sm font-semibold text-primary-500">{percent}%</span>
        </div>
        <div className="h-2 bg-surface-tertiary rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[#a07d5e] to-[#8b6342] rounded-full transition-all"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      <div className="grid gap-3">
        {milestones.map((milestone) => {
          const overdue =
            milestone.status !== 'completed' &&
            milestone.due_date &&
            new Date(milestone.due_date).getTime() < now;
          return (
            <div
              key={milestone.id}
              className={`group p-4 rounded-lg border transition-shadow hover:shadow-md ${
                overdue
                  ? 'bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-900'
                  : 'bg-surface-secondary border-outline'
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <h3 className={`font-medium flex-1 ${milestone.status === 'completed' ? 'text-on-surface-secondary line-through' : 'text-on-surface'}`}>
                  {milestone.title}
                </h3>
                <div className="flex items-center gap-2">
                  {/* 点击徽章循环切换状态 */}
                  <button
                    onClick={() => onCycleStatus(milestone)}
                    className={`text-xs px-2 py-1 rounded cursor-pointer hover:opacity-80 transition-opacity ${
                      milestone.status === 'completed'
                        ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                        : milestone.status === 'in_progress'
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                        : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                    }`}
                    title="点击切换状态"
                  >
                    {milestone.status === 'pending' && '📋 待办'}
                    {milestone.status === 'in_progress' && '🚀 进行中'}
                    {milestone.status === 'completed' && '✅ 已完成'}
                  </button>
                  {milestone.due_date && (
                    <span className={`text-xs px-2 py-1 rounded ${
                      overdue
                        ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                        : 'bg-surface-primary text-on-surface-secondary'
                    }`}>
                      📅 {new Date(milestone.due_date).toLocaleDateString()}{overdue ? '（已逾期）' : ''}
                    </span>
                  )}
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                    <button
                      onClick={() => onEdit(milestone)}
                      className="p-1.5 text-primary-500 hover:bg-surface-primary rounded transition-colors text-sm"
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
                <p className="text-sm text-on-surface-secondary">{milestone.description}</p>
              )}
            </div>
          );
        })}
      </div>
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
      {/* 分类过滤 */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => onCategoryChange(null)}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            selectedCategory === null
              ? 'bg-primary-500 text-white'
              : 'bg-surface-secondary text-on-surface-variant border border-outline hover:bg-surface-primary'
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
                  ? 'bg-primary-500 text-white'
                  : 'bg-surface-secondary text-on-surface-variant border border-outline hover:bg-surface-primary'
              }`}
            >
              {info.icon} {info.label}
            </button>
          );
        })}
      </div>

      {/* Bento 网格布局 */}
      {filteredSettings.length === 0 ? (
        <div className="text-center py-12 text-on-surface-secondary">
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
                className="group p-5 bg-surface-secondary rounded-xl border border-outline hover:shadow-lg transition-all relative overflow-hidden"
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
                    className="p-1.5 bg-surface-primary text-primary-500 hover:bg-surface-primary rounded shadow-sm transition-colors text-sm"
                    title="编辑"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => onDelete(setting.id)}
                    className="p-1.5 bg-surface-primary text-red-500 hover:bg-red-50 rounded shadow-sm transition-colors text-sm"
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
                    <div className="text-xs text-on-surface-secondary mb-1">{categoryInfo.label}</div>
                    <h3 className="font-semibold text-on-surface line-clamp-1">{setting.title}</h3>
                  </div>
                </div>

                {/* 内容 */}
                <p className="text-sm text-on-surface-secondary line-clamp-3 mb-3">
                  {setting.content}
                </p>

                {/* 标签 */}
                {setting.tags && setting.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {setting.tags.slice(0, 3).map((tag, idx) => (
                      <span 
                        key={idx}
                        className="text-xs px-2 py-0.5 rounded bg-surface-primary text-on-surface-secondary"
                      >
                        {tag}
                      </span>
                    ))}
                    {setting.tags.length > 3 && (
                      <span className="text-xs px-2 py-0.5 text-on-surface-secondary">
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
        <label className="block text-sm font-medium text-on-surface-variant mb-2">分类</label>
        <select
          value={setting.category}
          onChange={(e) => onChange({ ...setting, category: e.target.value as WorldSettingCategory })}
          className="w-full px-3 py-2 border border-outline rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
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
        <label className="block text-sm font-medium text-on-surface-variant mb-2">标题</label>
        <input
          type="text"
          value={setting.title}
          onChange={(e) => onChange({ ...setting, title: e.target.value })}
          className="w-full px-3 py-2 border border-outline rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          placeholder="输入设定标题"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-on-surface-variant mb-2">内容</label>
        <textarea
          value={setting.content}
          onChange={(e) => onChange({ ...setting, content: e.target.value })}
          className="w-full px-3 py-2 border border-outline rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 min-h-[150px]"
          placeholder="输入详细内容"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-on-surface-variant mb-2">图标（emoji）</label>
        <input
          type="text"
          value={setting.icon_type || ''}
          onChange={(e) => onChange({ ...setting, icon_type: e.target.value })}
          className="w-full px-3 py-2 border border-outline rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          placeholder="例如: 🏙️ 或留空使用默认图标"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-on-surface-variant mb-2">标签（用逗号分隔）</label>
        <input
          type="text"
          value={setting.tags?.join(', ') || ''}
          onChange={(e) => onChange({ 
            ...setting, 
            tags: e.target.value.split(',').map(t => t.trim()).filter(t => t) 
          })}
          className="w-full px-3 py-2 border border-outline rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          placeholder="例如: 现代, 商业, 地标"
        />
      </div>
    </>
  );
}

// AI 大纲生成对话框
function AiOutlineDialog({
  premise,
  setPremise,
  chapterCount,
  setChapterCount,
  output,
  running,
  parsed,
  applying,
  onGenerate,
  onStop,
  onApply,
  onClose,
}: {
  premise: string;
  setPremise: (v: string) => void;
  chapterCount: number;
  setChapterCount: (v: number) => void;
  output: string;
  running: boolean;
  parsed: ParsedOutlineChapter[];
  applying: boolean;
  onGenerate: () => void;
  onStop: () => void;
  onApply: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]">
      <div className="bg-surface-primary rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[85vh] flex flex-col">
        <div className="px-6 py-4 border-b border-outline flex items-center justify-between">
          <h3 className="text-lg font-semibold text-on-surface">✨ AI 生成大纲</h3>
          <button onClick={onClose} className="text-on-surface-secondary hover:text-on-surface">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-4 space-y-4 flex-1 overflow-y-auto">
          <div>
            <label className="block text-sm font-medium text-on-surface-variant mb-2">一句话创意</label>
            <textarea
              value={premise}
              onChange={(e) => setPremise(e.target.value)}
              disabled={running}
              className="w-full px-3 py-2 border border-outline rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 min-h-[80px]"
              placeholder="例如：返乡青年顾川在废弃车站发现一张十年前的车票，牵出一场被全镇掩盖的事故真相"
            />
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-on-surface-variant">章节数</label>
            <select
              value={chapterCount}
              onChange={(e) => setChapterCount(parseInt(e.target.value))}
              disabled={running}
              className="px-3 py-2 border border-outline rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {[5, 8, 10, 12, 15, 20, 30].map((n) => (
                <option key={n} value={n}>{n} 章</option>
              ))}
            </select>
          </div>

          {(running || output) && (
            <div>
              <label className="block text-sm font-medium text-on-surface-variant mb-2">
                {running ? '生成中…' : parsed.length > 0 ? `解析出 ${parsed.length} 章` : '输出'}
              </label>
              <div className="p-3 bg-surface-secondary rounded-lg border border-outline text-sm text-on-surface whitespace-pre-wrap max-h-48 overflow-y-auto leading-relaxed">
                {running ? (
                  <>
                    {output.slice(-400)}
                    <span className="animate-pulse">▍</span>
                  </>
                ) : (
                  output || '（无输出）'
                )}
              </div>
            </div>
          )}

          {!running && parsed.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-on-surface-variant mb-2">章节预览</label>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {parsed.map((ch, i) => (
                  <div key={i} className="p-2 bg-surface-secondary rounded border border-outline">
                    <span className="text-sm font-medium text-on-surface">第{i + 1}章 {ch.title}</span>
                    {ch.description && (
                      <p className="text-xs text-on-surface-secondary line-clamp-2 mt-0.5">{ch.description}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-outline flex justify-end gap-3">
          {running ? (
            <button
              type="button"
              onClick={onStop}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-red-500 text-white hover:bg-red-600 transition-colors"
            >
              ■ 停止
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm font-medium text-on-surface-variant hover:bg-surface-secondary transition-colors"
              >
                {parsed.length > 0 ? '取消' : '关闭'}
              </button>
              {parsed.length > 0 ? (
                <button
                  type="button"
                  onClick={onApply}
                  disabled={applying}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-primary-500 text-white hover:bg-primary-600 transition-colors disabled:opacity-50"
                >
                  {applying ? '创建中…' : `应用到大纲（${parsed.length} 章）`}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onGenerate}
                  disabled={!premise.trim()}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-primary-500 text-white hover:bg-primary-600 transition-colors disabled:opacity-50"
                >
                  生成
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
