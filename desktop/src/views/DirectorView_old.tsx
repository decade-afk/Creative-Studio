/**
 * DirectorView - 导演视图组件
 *
 * 功能：
 * 1. 伏笔追踪系统
 * 2. 冲突矩阵管理
 * 3. 分镜时间线
 * 4. 素材库管理
 */

import { useState, useEffect } from 'react';
import type { Clue, Conflict, Storyboard, Asset } from '../types/storage';
import { getCluesByWorkId, createClue } from '../services/clueService';
import { getConflictsByWorkId, createConflict } from '../services/conflictService';
import { getStoryboardsByWorkId, createStoryboard } from '../services/storyboardService';
import { getAssetsByWorkId, createAsset } from '../services/assetService';
import { getWorks } from '../services/workService';

type Tab = 'clues' | 'conflicts' | 'storyboards' | 'assets';

export default function DirectorView() {
  const [currentWorkId, setCurrentWorkId] = useState<string>('');
  const [currentTab, setCurrentTab] = useState<Tab>('clues');

  // 数据状态
  const [clues, setClues] = useState<Clue[]>([]);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [storyboards, setStoryboards] = useState<Storyboard[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);

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

    async function loadData() {
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
    }

    loadData();
  }, [currentWorkId]);

  // 快速创建项
  const handleQuickCreate = async () => {
    if (!currentWorkId) return;

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
          break;
      }

      // 重新加载数据
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
      console.error('创建失败:', error);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-[#faf8f5] overflow-hidden">
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
          className="px-4 py-2 bg-[#a07d5e] text-white rounded-lg text-sm font-medium hover:bg-[#8b6342] transition-colors"
        >
          + 新建
        </button>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-auto p-6">
        {currentTab === 'clues' && <CluesView clues={clues} />}

        {currentTab === 'conflicts' && <ConflictsView conflicts={conflicts} />}

        {currentTab === 'storyboards' && <StoryboardsView storyboards={storyboards} />}

        {currentTab === 'assets' && <AssetsView assets={assets} />}

        {!currentWorkId && (
          <div className="flex items-center justify-center h-full text-[#7a6e5f]">
            <div className="text-center">
              <p>请先创建作品</p>
              <p className="text-sm mt-2">切换到创作视图创建您的第一个作品</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// 伏笔视图
function CluesView({ clues }: { clues: Clue[] }) {
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
        <div
          key={clue.id}
          className="p-4 bg-white rounded-lg border border-[#e5ddd2] hover:shadow-md transition-shadow"
        >
          <div className="flex items-start justify-between mb-2">
            <h3 className="font-medium text-[#38342e]">{clue.name}</h3>
            <div className="flex gap-2">
              <span
                className={`text-xs px-2 py-1 rounded ${
                  clue.source === 'ai_detected'
                    ? 'bg-purple-100 text-purple-700'
                    : 'bg-blue-100 text-blue-700'
                }`}
              >
                {clue.source === 'ai_detected' ? '🤖 AI检测' : '✍️ 手动'}
              </span>
              <span
                className={`text-xs px-2 py-1 rounded ${
                  clue.status === 'resolved'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-orange-100 text-orange-700'
                }`}
              >
                {clue.status === 'open' ? '📂 未解决' : '✅ 已解决'}
              </span>
            </div>
          </div>
          {clue.description && (
            <p className="text-sm text-[#7a6e5f]">{clue.description}</p>
          )}
        </div>
      ))}
    </div>
  );
}

// 冲突视图
function ConflictsView({ conflicts }: { conflicts: Conflict[] }) {
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
        <div
          key={conflict.id}
          className="p-4 bg-white rounded-lg border border-[#e5ddd2] hover:shadow-md transition-shadow"
        >
          <div className="flex items-start justify-between mb-2">
            <h3 className="font-medium text-[#38342e]">{conflict.name}</h3>
            <div className="flex gap-2">
              <span className="text-xs px-2 py-1 rounded bg-[#faf8f5] text-[#7a6e5f]">
                {conflict.type === 'character' && '👥 人物'}
                {conflict.type === 'environment' && '🌍 环境'}
                {conflict.type === 'internal' && '💭 内心'}
                {conflict.type === 'social' && '🏛️ 社会'}
              </span>
              <span
                className={`text-xs px-2 py-1 rounded ${
                  conflict.intensity === 'critical'
                    ? 'bg-red-100 text-red-700'
                    : conflict.intensity === 'high'
                    ? 'bg-orange-100 text-orange-700'
                    : conflict.intensity === 'medium'
                    ? 'bg-yellow-100 text-yellow-700'
                    : 'bg-gray-100 text-gray-700'
                }`}
              >
                {conflict.intensity === 'critical' && '🔴 关键'}
                {conflict.intensity === 'high' && '🟠 高'}
                {conflict.intensity === 'medium' && '🟡 中'}
                {conflict.intensity === 'low' && '⚪ 低'}
              </span>
              <span
                className={`text-xs px-2 py-1 rounded ${
                  conflict.status === 'resolved'
                    ? 'bg-green-100 text-green-700'
                    : conflict.status === 'resolving'
                    ? 'bg-blue-100 text-blue-700'
                    : conflict.status === 'escalating'
                    ? 'bg-orange-100 text-orange-700'
                    : 'bg-gray-100 text-gray-700'
                }`}
              >
                {conflict.status === 'active' && '⚡ 活跃'}
                {conflict.status === 'escalating' && '📈 升级'}
                {conflict.status === 'resolving' && '📉 缓解'}
                {conflict.status === 'resolved' && '✅ 已解决'}
              </span>
            </div>
          </div>
          {conflict.description && (
            <p className="text-sm text-[#7a6e5f] mb-2">{conflict.description}</p>
          )}
          {conflict.characters && (
            <p className="text-xs text-[#7a6e5f]">
              <span className="font-medium">涉及角色：</span>
              {conflict.characters}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

// 分镜视图
function StoryboardsView({ storyboards }: { storyboards: Storyboard[] }) {
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
        <div
          key={board.id}
          className="p-4 bg-white rounded-lg border border-[#e5ddd2] hover:shadow-md transition-shadow"
        >
          <div className="flex items-start justify-between mb-2">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs px-2 py-1 rounded bg-[#faf8f5] text-[#7a6e5f] font-mono">
                  #{board.order + 1}
                </span>
                <h3 className="font-medium text-[#38342e]">{board.title}</h3>
              </div>
              {board.description && (
                <p className="text-sm text-[#7a6e5f] mb-2">{board.description}</p>
              )}
            </div>
            <div className="flex flex-col gap-1 ml-4">
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
              {board.duration > 0 && (
                <span className="text-xs px-2 py-1 rounded bg-[#faf8f5] text-[#7a6e5f] whitespace-nowrap">
                  ⏱️ {board.duration}s
                </span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// 素材视图
function AssetsView({ assets }: { assets: Asset[] }) {
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
        <div
          key={asset.id}
          className="p-4 bg-white rounded-lg border border-[#e5ddd2] hover:shadow-md transition-shadow"
        >
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
                <p className="text-xs text-[#7a6e5f]">
                  {(asset.file_size / 1024).toFixed(1)} KB
                </p>
              </div>
            </div>
            {asset.tags && asset.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {asset.tags.map((tag, index) => (
                  <span
                    key={index}
                    className="text-xs px-2 py-0.5 rounded bg-[#faf8f5] text-[#7a6e5f]"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
