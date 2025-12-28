/**
 * SettingsView - 设置面板组件
 *
 * 功能：
 * 1. 用户信息 - 管理用户头像、用户名、邮箱
 * 2. AI 设置 - 配置本地 AI 模型路径和参数
 * 3. 外观设置 - 切换主题（浅色/深色/自动）
 * 4. 快捷键配置 - 自定义键盘快捷键（待实现）
 * 5. 关于信息 - 显示应用版本和相关信息（待实现）
 *
 * 设计：
 * - 模态对话框形式，带背景遮罩
 * - 左侧侧边栏导航
 * - 右侧设置内容区域
 */

import { useState, useEffect } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { convertFileSrc } from '@tauri-apps/api/core';
import type { AIConfig } from '../types/ai';
import {
  getAIConfig,
  updateAIConfig,
  loadAIModel,
  unloadAIModel,
  isAIModelLoaded,
} from '../services/aiService';
import { useToast } from '../components/Toast';
import { useTheme } from '../contexts/ThemeContext';
import {
  getUserProfile,
  saveUserProfile,
  selectAvatar,
  validateEmail,
  validateUsername,
  type UserProfile,
} from '../services/userService';

// 设置选项卡类型
type SettingsTab = 'profile' | 'ai' | 'appearance' | 'shortcuts' | 'about';

// 组件属性接口
interface SettingsViewProps {
  onClose: () => void;  // 关闭设置面板的回调
}

export default function SettingsView({ onClose }: SettingsViewProps) {
  // 当前选中的选项卡
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');

  // AI 相关状态
  const [aiConfig, setAiConfig] = useState<AIConfig>({
    model_path: '',
    context_size: 4096,
    gpu_layers: 0,
    threads: 4,
    temperature: 0.7,
    top_p: 0.9,
    top_k: 40,
    repeat_penalty: 1.1,
  });
  const [modelLoaded, setModelLoaded] = useState(false);
  const [loadingModel, setLoadingModel] = useState(false);
  const { showToast, ToastComponent } = useToast();

  // 主题相关
  const { mode: themeMode, setMode: setThemeMode } = useTheme();

  // 用户信息相关
  const [userProfile, setUserProfile] = useState<UserProfile>({
    username: '创作者',
    email: '',
  });
  const [savingProfile, setSavingProfile] = useState(false);

  // 加载 AI 配置
  useEffect(() => {
    async function loadConfig() {
      try {
        const config = await getAIConfig();
        setAiConfig(config);

        const loaded = await isAIModelLoaded();
        setModelLoaded(loaded);
      } catch (error) {
        console.error('加载 AI 配置失败:', error);
      }
    }
    loadConfig();
  }, []);

  // 加载用户信息
  useEffect(() => {
    async function loadUserProfile() {
      try {
        const profile = await getUserProfile();
        setUserProfile(profile);
      } catch (error) {
        console.error('加载用户信息失败:', error);
      }
    }
    loadUserProfile();
  }, []);

  // 选择模型文件
  const handleSelectModel = async () => {
    const selected = await open({
      title: '选择 GGUF 模型文件',
      filters: [
        {
          name: 'GGUF Model',
          extensions: ['gguf'],
        },
        {
          name: 'All Files',
          extensions: ['*'],
        },
      ],
    });

    if (selected && typeof selected === 'string') {
      setAiConfig({ ...aiConfig, model_path: selected });
    }
  };

  // 保存 AI 配置
  const handleSaveAIConfig = async () => {
    try {
      await updateAIConfig(aiConfig);
      showToast('AI 配置已保存', 'success');
    } catch (error: any) {
      showToast(`保存失败: ${error}`, 'error');
    }
  };

  // 加载模型
  const handleLoadModel = async () => {
    if (!aiConfig.model_path) {
      showToast('请先选择模型文件', 'warning');
      return;
    }

    setLoadingModel(true);
    try {
      // 先保存配置
      await updateAIConfig(aiConfig);
      // 再加载模型
      await loadAIModel();
      setModelLoaded(true);
      showToast('模型加载成功！', 'success');
    } catch (error: any) {
      showToast(`加载模型失败: ${error}`, 'error');
      setModelLoaded(false);
    } finally {
      setLoadingModel(false);
    }
  };

  // 卸载模型
  const handleUnloadModel = async () => {
    try {
      await unloadAIModel();
      setModelLoaded(false);
      showToast('模型已卸载', 'success');
    } catch (error: any) {
      showToast(`卸载失败: ${error}`, 'error');
    }
  };

  // 上传头像
  const handleUploadAvatar = async () => {
    try {
      const result = await selectAvatar();
      if (result) {
        setUserProfile({
          ...userProfile,
          avatarPath: result.path,
          avatarData: result.data,
        });
        showToast('头像已更新', 'success');
      }
    } catch (error: any) {
      showToast(`上传头像失败: ${error}`, 'error');
    }
  };

  // 保存用户信息
  const handleSaveUserProfile = async () => {
    // 验证用户名
    const usernameValidation = validateUsername(userProfile.username);
    if (!usernameValidation.valid) {
      showToast(usernameValidation.error || '用户名无效', 'error');
      return;
    }

    // 验证邮箱
    if (userProfile.email && !validateEmail(userProfile.email)) {
      showToast('邮箱格式不正确', 'error');
      return;
    }

    setSavingProfile(true);
    try {
      await saveUserProfile(userProfile);
      showToast('用户信息已保存', 'success');
    } catch (error: any) {
      showToast(`保存失败: ${error}`, 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center">
      {ToastComponent}

      <div className="bg-[#f2ede7] rounded-2xl shadow-2xl w-full max-w-5xl max-h-[85vh] flex overflow-hidden">
        {/* Sidebar */}
        <div className="w-64 bg-[#e8e3dc] border-r border-[#e5ddd2] p-6">
          <h2 className="text-xl font-bold text-[#38342e] mb-6">设置</h2>
          <div className="space-y-2">
            {/* 用户信息 */}
            <div
              onClick={() => setActiveTab('profile')}
              className={`px-4 py-3 rounded-lg font-medium cursor-pointer transition-colors ${
                activeTab === 'profile'
                  ? 'bg-[rgba(139,99,66,0.1)] text-primary-600 border-l-3 border-primary-500'
                  : 'text-[#7a6e5f] hover:bg-[#f5f3f0]'
              }`}
            >
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <span>用户信息</span>
              </div>
            </div>

            {/* AI 设置 */}
            <div
              onClick={() => setActiveTab('ai')}
              className={`px-4 py-3 rounded-lg font-medium cursor-pointer transition-colors ${
                activeTab === 'ai'
                  ? 'bg-[rgba(139,99,66,0.1)] text-primary-600 border-l-3 border-primary-500'
                  : 'text-[#7a6e5f] hover:bg-[#f5f3f0]'
              }`}
            >
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                <span>AI 助手</span>
              </div>
            </div>

            {/* 外观 */}
            <div
              onClick={() => setActiveTab('appearance')}
              className={`px-4 py-3 rounded-lg font-medium cursor-pointer transition-colors ${
                activeTab === 'appearance'
                  ? 'bg-[rgba(139,99,66,0.1)] text-primary-600 border-l-3 border-primary-500'
                  : 'text-[#7a6e5f] hover:bg-[#f5f3f0]'
              }`}
            >
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                </svg>
                <span>外观</span>
              </div>
            </div>

            {/* 快捷键 */}
            <div
              onClick={() => setActiveTab('shortcuts')}
              className={`px-4 py-3 rounded-lg font-medium cursor-pointer transition-colors ${
                activeTab === 'shortcuts'
                  ? 'bg-[rgba(139,99,66,0.1)] text-primary-600 border-l-3 border-primary-500'
                  : 'text-[#7a6e5f] hover:bg-[#f5f3f0]'
              }`}
            >
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                </svg>
                <span>快捷键</span>
              </div>
            </div>

            {/* 关于 */}
            <div
              onClick={() => setActiveTab('about')}
              className={`px-4 py-3 rounded-lg font-medium cursor-pointer transition-colors ${
                activeTab === 'about'
                  ? 'bg-[rgba(139,99,66,0.1)] text-primary-600 border-l-3 border-primary-500'
                  : 'text-[#7a6e5f] hover:bg-[#f5f3f0]'
              }`}
            >
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>关于</span>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <div className="h-16 border-b border-[#e5ddd2] flex items-center justify-between px-6">
            <h3 className="text-lg font-semibold text-[#38342e]">
              {activeTab === 'profile' && '用户信息'}
              {activeTab === 'ai' && 'AI 助手设置'}
              {activeTab === 'appearance' && '外观设置'}
              {activeTab === 'shortcuts' && '快捷键配置'}
              {activeTab === 'about' && '关于'}
            </h3>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg hover:bg-[#e8e3dc] flex items-center justify-center text-[#7a6e5f] hover:text-[#38342e] transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Settings Content */}
          <div className="flex-1 overflow-auto p-6">
            <div className="max-w-3xl">
              {/* 用户信息 Tab */}
              {activeTab === 'profile' && (
                <>
                  {/* Avatar Section */}
                  <div className="mb-8 pb-8 border-b border-[#e5ddd2]">
                    <label className="block text-sm font-medium text-[#38342e] mb-4">头像</label>
                    <div className="flex items-center gap-6">
                      {userProfile.avatarData ? (
                        <img
                          src={userProfile.avatarData.startsWith('data:') ? userProfile.avatarData : convertFileSrc(userProfile.avatarData)}
                          alt="用户头像"
                          className="w-20 h-20 rounded-full object-cover border-2 border-primary-200"
                        />
                      ) : (
                        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary-400 to-accent-500 flex items-center justify-center text-white text-2xl font-bold">
                          {userProfile.username.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <button onClick={handleUploadAvatar} className="btn">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                        </svg>
                        <span>上传头像</span>
                      </button>
                    </div>
                  </div>

                  {/* Name Section */}
                  <div className="mb-8 pb-8 border-b border-[#e5ddd2]">
                    <label className="block text-sm font-medium text-[#38342e] mb-2">用户名</label>
                    <input
                      type="text"
                      className="form-input max-w-md"
                      placeholder="输入用户名"
                      value={userProfile.username}
                      onChange={(e) => setUserProfile({ ...userProfile, username: e.target.value })}
                    />
                    <p className="mt-2 text-sm text-[#9a8c79]">这将显示在您的作品中（2-20个字符）</p>
                  </div>

                  {/* Email Section */}
                  <div className="mb-8">
                    <label className="block text-sm font-medium text-[#38342e] mb-2">邮箱</label>
                    <input
                      type="email"
                      className="form-input max-w-md"
                      placeholder="your@email.com"
                      value={userProfile.email}
                      onChange={(e) => setUserProfile({ ...userProfile, email: e.target.value })}
                    />
                    <p className="mt-2 text-sm text-[#9a8c79]">用于接收通知和找回密码（可选）</p>
                  </div>
                </>
              )}

              {/* AI 设置 Tab */}
              {activeTab === 'ai' && (
                <>
                  {/* 模型状态 */}
                  <div className="mb-6 p-4 bg-primary-50 rounded-lg border border-primary-200">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${modelLoaded ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
                        <span className="text-sm font-medium text-[#38342e]">
                          {modelLoaded ? '模型已加载' : '模型未加载'}
                        </span>
                      </div>
                      {modelLoaded ? (
                        <button onClick={handleUnloadModel} className="btn btn-sm">
                          卸载模型
                        </button>
                      ) : (
                        <button
                          onClick={handleLoadModel}
                          disabled={loadingModel || !aiConfig.model_path}
                          className="btn btn-primary btn-sm"
                        >
                          {loadingModel ? '加载中...' : '加载模型'}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* 模型文件路径 */}
                  <div className="mb-6 pb-6 border-b border-[#e5ddd2]">
                    <label className="block text-sm font-medium text-[#38342e] mb-2">
                      模型文件路径
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        className="form-input flex-1"
                        placeholder="选择 GGUF 模型文件"
                        value={aiConfig.model_path}
                        readOnly
                      />
                      <button onClick={handleSelectModel} className="btn">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                        </svg>
                        <span>浏览</span>
                      </button>
                    </div>
                    <p className="mt-2 text-sm text-[#9a8c79]">
                      支持 GGUF 格式的本地模型文件
                    </p>
                  </div>

                  {/* 基础参数 */}
                  <div className="mb-6 pb-6 border-b border-[#e5ddd2]">
                    <h4 className="text-base font-semibold text-[#38342e] mb-4">基础参数</h4>

                    {/* 上下文大小 */}
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-[#38342e] mb-2">
                        上下文大小（Context Size）
                      </label>
                      <input
                        type="number"
                        className="form-input max-w-xs"
                        value={aiConfig.context_size}
                        onChange={(e) => setAiConfig({ ...aiConfig, context_size: parseInt(e.target.value) })}
                        min={512}
                        max={32768}
                        step={512}
                      />
                      <p className="mt-1 text-xs text-[#9a8c79]">
                        推荐值: 2048-8192，越大消耗内存越多
                      </p>
                    </div>

                    {/* GPU 层数 */}
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-[#38342e] mb-2">
                        GPU 加速层数
                      </label>
                      <input
                        type="number"
                        className="form-input max-w-xs"
                        value={aiConfig.gpu_layers}
                        onChange={(e) => setAiConfig({ ...aiConfig, gpu_layers: parseInt(e.target.value) })}
                        min={0}
                        max={100}
                      />
                      <p className="mt-1 text-xs text-[#9a8c79]">
                        设置为 0 使用 CPU 模式，如有 GPU 可设置 20-40
                      </p>
                    </div>

                    {/* 线程数 */}
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-[#38342e] mb-2">
                        CPU 线程数
                      </label>
                      <input
                        type="number"
                        className="form-input max-w-xs"
                        value={aiConfig.threads}
                        onChange={(e) => setAiConfig({ ...aiConfig, threads: parseInt(e.target.value) })}
                        min={1}
                        max={32}
                      />
                      <p className="mt-1 text-xs text-[#9a8c79]">
                        推荐设置为 CPU 核心数的 50%-75%
                      </p>
                    </div>
                  </div>

                  {/* 生成参数 */}
                  <div className="mb-6">
                    <h4 className="text-base font-semibold text-[#38342e] mb-4">生成参数</h4>

                    {/* 温度 */}
                    <div className="mb-4">
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-sm font-medium text-[#38342e]">
                          温度（Temperature）
                        </label>
                        <span className="text-sm text-primary-600 font-mono">{aiConfig.temperature}</span>
                      </div>
                      <input
                        type="range"
                        className="w-full h-2 bg-[#e5ddd2] rounded-lg appearance-none cursor-pointer accent-primary-500"
                        value={aiConfig.temperature}
                        onChange={(e) => setAiConfig({ ...aiConfig, temperature: parseFloat(e.target.value) })}
                        min={0}
                        max={2}
                        step={0.1}
                      />
                      <p className="mt-1 text-xs text-[#9a8c79]">
                        控制随机性：低（更确定）高（更创造性）
                      </p>
                    </div>

                    {/* Top-P */}
                    <div className="mb-4">
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-sm font-medium text-[#38342e]">
                          Top-P 采样
                        </label>
                        <span className="text-sm text-primary-600 font-mono">{aiConfig.top_p}</span>
                      </div>
                      <input
                        type="range"
                        className="w-full h-2 bg-[#e5ddd2] rounded-lg appearance-none cursor-pointer accent-primary-500"
                        value={aiConfig.top_p}
                        onChange={(e) => setAiConfig({ ...aiConfig, top_p: parseFloat(e.target.value) })}
                        min={0}
                        max={1}
                        step={0.05}
                      />
                      <p className="mt-1 text-xs text-[#9a8c79]">
                        核采样：推荐 0.9-0.95
                      </p>
                    </div>

                    {/* Top-K */}
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-[#38342e] mb-2">
                        Top-K 采样
                      </label>
                      <input
                        type="number"
                        className="form-input max-w-xs"
                        value={aiConfig.top_k}
                        onChange={(e) => setAiConfig({ ...aiConfig, top_k: parseInt(e.target.value) })}
                        min={1}
                        max={100}
                      />
                      <p className="mt-1 text-xs text-[#9a8c79]">
                        推荐值: 40
                      </p>
                    </div>

                    {/* 重复惩罚 */}
                    <div className="mb-4">
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-sm font-medium text-[#38342e]">
                          重复惩罚（Repeat Penalty）
                        </label>
                        <span className="text-sm text-primary-600 font-mono">{aiConfig.repeat_penalty}</span>
                      </div>
                      <input
                        type="range"
                        className="w-full h-2 bg-[#e5ddd2] rounded-lg appearance-none cursor-pointer accent-primary-500"
                        value={aiConfig.repeat_penalty}
                        onChange={(e) => setAiConfig({ ...aiConfig, repeat_penalty: parseFloat(e.target.value) })}
                        min={1}
                        max={1.5}
                        step={0.05}
                      />
                      <p className="mt-1 text-xs text-[#9a8c79]">
                        防止重复：推荐 1.05-1.15
                      </p>
                    </div>
                  </div>
                </>
              )}

              {/* 外观 Tab */}
              {activeTab === 'appearance' && (
                <div className="mb-8">
                  <label className="block text-sm font-medium text-[#38342e] mb-4">主题</label>
                  <div className="flex gap-4">
                    <label className="cursor-pointer">
                      <input
                        type="radio"
                        name="theme"
                        className="sr-only"
                        checked={themeMode === 'light'}
                        onChange={() => setThemeMode('light')}
                      />
                      <div className={`w-24 h-16 rounded-lg border-2 ${
                        themeMode === 'light' ? 'border-primary-500' : 'border-[#e5ddd2]'
                      } bg-[#faf8f5] flex items-center justify-center text-sm font-medium text-[#38342e] shadow-sm transition-all hover:border-primary-400`}>
                        浅色
                      </div>
                    </label>
                    <label className="cursor-pointer">
                      <input
                        type="radio"
                        name="theme"
                        className="sr-only"
                        checked={themeMode === 'dark'}
                        onChange={() => setThemeMode('dark')}
                      />
                      <div className={`w-24 h-16 rounded-lg border-2 ${
                        themeMode === 'dark' ? 'border-primary-500' : 'border-[#e5ddd2]'
                      } bg-[#1a1a1a] flex items-center justify-center text-sm font-medium text-white transition-all hover:border-primary-400`}>
                        深色
                      </div>
                    </label>
                    <label className="cursor-pointer">
                      <input
                        type="radio"
                        name="theme"
                        className="sr-only"
                        checked={themeMode === 'auto'}
                        onChange={() => setThemeMode('auto')}
                      />
                      <div className={`w-24 h-16 rounded-lg border-2 ${
                        themeMode === 'auto' ? 'border-primary-500' : 'border-[#e5ddd2]'
                      } bg-gradient-to-br from-[#1a1a1a] to-[#faf8f5] flex items-center justify-center text-sm font-medium text-[#7a6e5f] transition-all hover:border-primary-400`}>
                        自动
                      </div>
                    </label>
                  </div>
                  <p className="mt-4 text-sm text-[#9a8c79]">
                    {themeMode === 'auto' && '跟随系统设置自动切换主题'}
                    {themeMode === 'light' && '始终使用浅色主题'}
                    {themeMode === 'dark' && '始终使用深色主题'}
                  </p>
                </div>
              )}

              {/* 快捷键 Tab */}
              {activeTab === 'shortcuts' && (
                <div className="text-center py-12 text-[#9a8c79]">
                  <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                  </svg>
                  <p>快捷键配置功能即将推出</p>
                </div>
              )}

              {/* 关于 Tab */}
              {activeTab === 'about' && (
                <div className="py-8">
                  <div className="text-center mb-10">
                    <div className="text-6xl mb-4">🎬</div>
                    <h3 className="text-2xl font-bold text-[#38342e] mb-2">Creative Studio</h3>
                    <p className="text-sm text-[#9a8c79] mb-6">版本 0.1.0 Beta</p>
                    <p className="text-sm text-[#7a6e5f] max-w-md mx-auto mb-8">
                      智能创作工作室，支持剧本创作、AI 辅助写作、分镜生成等功能
                    </p>
                  </div>

                  <div className="space-y-6 max-w-2xl mx-auto">
                    {/* 技术栈 */}
                    <div className="p-4 bg-primary-50 rounded-lg border border-primary-200">
                      <h4 className="text-sm font-semibold text-[#38342e] mb-3">技术栈</h4>
                      <div className="grid grid-cols-2 gap-3 text-sm text-[#7a6e5f]">
                        <div className="flex items-center gap-2">
                          <span className="text-primary-500">•</span>
                          <span>Tauri 2.0 + Rust</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-primary-500">•</span>
                          <span>React 18 + TypeScript</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-primary-500">•</span>
                          <span>Loci (Local AI)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-primary-500">•</span>
                          <span>Tailwind CSS</span>
                        </div>
                      </div>
                    </div>

                    {/* 功能特性 */}
                    <div className="p-4 bg-accent-50 rounded-lg border border-accent-200">
                      <h4 className="text-sm font-semibold text-[#38342e] mb-3">核心功能</h4>
                      <div className="space-y-2 text-sm text-[#7a6e5f]">
                        <div className="flex items-start gap-2">
                          <span className="text-accent-500 mt-1">✓</span>
                          <span>本地 AI 模型集成（支持 GGUF 格式）</span>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="text-accent-500 mt-1">✓</span>
                          <span>剧本创作与管理</span>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="text-accent-500 mt-1">✓</span>
                          <span>AI 辅助写作与润色</span>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="text-accent-500 mt-1">✓</span>
                          <span>自定义主题（浅色/深色/自动）</span>
                        </div>
                      </div>
                    </div>

                    {/* 链接 */}
                    <div className="flex justify-center gap-4">
                      <a
                        href="https://github.com/anthropics/creative-studio-desktop"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn"
                      >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                        </svg>
                        <span>GitHub</span>
                      </a>
                      <button className="btn">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>使用文档</span>
                      </button>
                    </div>

                    {/* 版权信息 */}
                    <div className="text-center text-xs text-[#9a8c79] pt-6 border-t border-[#e5ddd2]">
                      <p>© 2025 Creative Studio. All rights reserved.</p>
                      <p className="mt-1">Open source project under MIT License</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="h-16 border-t border-[#e5ddd2] flex items-center justify-end gap-3 px-6 bg-[#e8e3dc]">
            <button onClick={onClose} className="btn">
              取消
            </button>
            {activeTab === 'ai' && (
              <button onClick={handleSaveAIConfig} className="btn btn-primary">
                保存 AI 配置
              </button>
            )}
            {activeTab === 'profile' && (
              <button
                onClick={handleSaveUserProfile}
                disabled={savingProfile}
                className="btn btn-primary"
              >
                {savingProfile ? '保存中...' : '保存更改'}
              </button>
            )}
            {activeTab === 'appearance' && (
              <div className="text-sm text-[#7a6e5f]">
                主题已自动保存
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
