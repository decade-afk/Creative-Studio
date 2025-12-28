/**
 * AI 配置对话框组件
 *
 * 替代原有的顶部横幅,使用现代化的对话框设计
 * 当 AI 服务不可用时显示,引导用户配置
 */
import { useState, useEffect } from 'react';
import {
  XMarkIcon,
  ExclamationTriangleIcon,
  SparklesIcon,
  Cog6ToothIcon,
  CheckCircleIcon
} from '@heroicons/react/24/outline';
import { open } from '@tauri-apps/plugin-dialog';
import { updateAIConfig, loadAIModel, getAIConfig } from '../services/aiService';
import type { AIConfig } from '../types/ai';

interface AIConfigDialogProps {
  /** 是否显示对话框 */
  isOpen: boolean;
  /** 关闭对话框的回调 */
  onClose: () => void;
  /** 配置成功的回调 */
  onConfigured?: () => void;
}

export default function AIConfigDialog({ isOpen, onClose, onConfigured }: AIConfigDialogProps) {
  const [step, setStep] = useState<'welcome' | 'configuring' | 'loading' | 'success' | 'error'>('welcome');
  const [aiConfig, setAiConfig] = useState<AIConfig | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [selectedPath, setSelectedPath] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // 加载当前配置
  useEffect(() => {
    if (isOpen) {
      loadCurrentConfig();
    }
  }, [isOpen]);

  const loadCurrentConfig = async () => {
    try {
      const config = await getAIConfig();
      setAiConfig(config);
      setSelectedPath(config.model_path || '');
    } catch (error) {
      console.error('加载配置失败:', error);
    }
  };

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
      setSelectedPath(selected);
    }
  };

  // 配置并加载模型
  const handleConfigureAndLoad = async () => {
    if (!selectedPath) {
      setErrorMessage('请先选择模型文件');
      return;
    }

    setIsLoading(true);
    setStep('configuring');
    setErrorMessage('');

    try {
      // 更新配置
      const newConfig: AIConfig = {
        ...aiConfig!,
        model_path: selectedPath,
      };

      await updateAIConfig(newConfig);

      // 加载模型
      setStep('loading');
      await loadAIModel();

      // 成功
      setStep('success');

      // 2秒后关闭并回调
      setTimeout(() => {
        onConfigured?.();
        onClose();
      }, 2000);

    } catch (error: any) {
      setStep('error');
      setErrorMessage(error?.toString() || '配置失败');
    } finally {
      setIsLoading(false);
    }
  };

  // 稍后配置
  const handleSkip = () => {
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        {/* 头部 */}
        <div className="relative bg-gradient-to-r from-primary-500 to-primary-600 px-8 py-6 text-white">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
              <SparklesIcon className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">AI 助手配置</h2>
              <p className="text-primary-100 text-sm mt-1">
                让 AI 助手帮你创作精彩内容
              </p>
            </div>
          </div>

          {step === 'welcome' && (
            <button
              onClick={handleSkip}
              className="absolute top-4 right-4 p-2 hover:bg-white/20 rounded-lg transition-colors"
            >
              <XMarkIcon className="w-6 h-6" />
            </button>
          )}
        </div>

        {/* 内容区 */}
        <div className="px-8 py-6">
          {/* 欢迎步骤 */}
          {step === 'welcome' && (
            <div className="space-y-6">
              {/* 功能介绍 */}
              <div className="bg-primary-50 border border-primary-200 rounded-xl p-5">
                <h3 className="font-semibold text-primary-900 mb-3 flex items-center gap-2">
                  <ExclamationTriangleIcon className="w-5 h-5 text-primary-600" />
                  AI 服务未配置
                </h3>
                <p className="text-sm text-primary-800 mb-3">
                  配置 AI 助手后,您将解锁以下强大功能:
                </p>
                <ul className="space-y-2 text-sm text-primary-700">
                  <li className="flex items-start gap-2">
                    <span className="text-primary-500 mt-0.5">✦</span>
                    <span><strong>智能续写</strong> - AI 根据上下文自动续写内容</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary-500 mt-0.5">✦</span>
                    <span><strong>剧情建议</strong> - 获取创意灵感和故事发展建议</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary-500 mt-0.5">✦</span>
                    <span><strong>对话生成</strong> - 自动生成角色对话</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary-500 mt-0.5">✦</span>
                    <span><strong>智能大纲</strong> - 快速生成故事大纲</span>
                  </li>
                </ul>
              </div>

              {/* 模型选择 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  模型文件路径
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={selectedPath}
                    onChange={(e) => setSelectedPath(e.target.value)}
                    placeholder="请选择 GGUF 格式的模型文件..."
                    className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
                  />
                  <button
                    onClick={handleSelectModel}
                    className="px-6 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors font-medium text-sm flex items-center gap-2"
                  >
                    <Cog6ToothIcon className="w-4 h-4" />
                    浏览
                  </button>
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  支持 GGUF 格式的本地大语言模型,推荐使用 Qwen、Llama 等系列模型
                </p>
              </div>

              {/* 错误提示 */}
              {errorMessage && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-800">
                  {errorMessage}
                </div>
              )}

              {/* 操作按钮 */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleConfigureAndLoad}
                  disabled={!selectedPath || isLoading}
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-primary-500/30"
                >
                  {isLoading ? '配置中...' : '配置并启用 AI'}
                </button>
                <button
                  onClick={handleSkip}
                  className="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors"
                >
                  稍后配置
                </button>
              </div>
            </div>
          )}

          {/* 配置中步骤 */}
          {step === 'configuring' && (
            <div className="py-12 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-100 rounded-full mb-4">
                <Cog6ToothIcon className="w-8 h-8 text-primary-600 animate-spin" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">正在保存配置...</h3>
              <p className="text-sm text-gray-600">请稍候</p>
            </div>
          )}

          {/* 加载中步骤 */}
          {step === 'loading' && (
            <div className="py-12 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-100 rounded-full mb-4">
                <SparklesIcon className="w-8 h-8 text-primary-600 animate-pulse" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">正在加载模型...</h3>
              <p className="text-sm text-gray-600">首次加载可能需要几秒到几分钟,请耐心等待</p>
              <div className="mt-6 max-w-sm mx-auto">
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-primary-500 to-primary-600 animate-pulse" style={{ width: '60%' }}></div>
                </div>
              </div>
            </div>
          )}

          {/* 成功步骤 */}
          {step === 'success' && (
            <div className="py-12 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
                <CheckCircleIcon className="w-8 h-8 text-green-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">配置成功!</h3>
              <p className="text-sm text-gray-600">AI 助手已就绪,开始创作吧 ✨</p>
            </div>
          )}

          {/* 错误步骤 */}
          {step === 'error' && (
            <div className="py-8">
              <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mb-4">
                  <ExclamationTriangleIcon className="w-8 h-8 text-red-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">配置失败</h3>
                <p className="text-sm text-red-700 mb-6">{errorMessage}</p>
                <div className="flex gap-3 justify-center">
                  <button
                    onClick={() => {
                      setStep('welcome');
                      setErrorMessage('');
                    }}
                    className="px-6 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition-colors"
                  >
                    重新配置
                  </button>
                  <button
                    onClick={handleSkip}
                    className="px-6 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors"
                  >
                    稍后再说
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
