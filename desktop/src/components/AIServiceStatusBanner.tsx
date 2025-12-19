/**
 * AI 服务状态横幅组件
 *
 * 当 AI 服务不可用时显示友好提示，说明哪些功能受影响。
 * 允许用户继续使用非 AI 功能，实现优雅降级。
 */
import { useState, useEffect } from 'react';
import { ExclamationTriangleIcon, XMarkIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { checkAIService, getAIStatus } from '../services/aiService';

interface AIServiceStatusBannerProps {
  /** 是否允许关闭横幅 */
  dismissible?: boolean;
}

function AIServiceStatusBanner({ dismissible = true }: AIServiceStatusBannerProps) {
  const [aiStatus, setAiStatus] = useState<'checking' | 'available' | 'unavailable' | 'error'>('checking');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isDismissed, setIsDismissed] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  // 检查 AI 服务状态
  const checkStatus = async () => {
    try {
      setAiStatus('checking');
      const status = await getAIStatus();

      if (status.modelLoaded) {
        setAiStatus('available');
        setErrorMessage('');
      } else {
        setAiStatus('unavailable');
        setErrorMessage(status.error || 'AI 模型未加载');
      }
    } catch (error: any) {
      setAiStatus('error');
      setErrorMessage(error?.message || '无法连接到 AI 服务');
    }
  };

  // 重试加载
  const handleRetry = async () => {
    setIsRetrying(true);
    await checkStatus();
    setTimeout(() => setIsRetrying(false), 500);
  };

  // 组件挂载时检查状态
  useEffect(() => {
    checkStatus();

    // 每 30 秒检查一次状态
    const interval = setInterval(checkStatus, 30000);

    return () => clearInterval(interval);
  }, []);

  // 如果被关闭或 AI 可用，不显示横幅
  if (isDismissed || aiStatus === 'available' || aiStatus === 'checking') {
    return null;
  }

  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-3 flex items-center justify-between">
      <div className="flex items-start gap-3 flex-1">
        {/* 警告图标 */}
        <ExclamationTriangleIcon className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />

        {/* 提示内容 */}
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-amber-900">AI 服务不可用</span>
            <span className="text-sm text-amber-700">
              {errorMessage}
            </span>
          </div>

          {/* 受影响功能说明 */}
          <div className="mt-2 text-sm text-amber-800">
            <p className="mb-1">以下功能暂时不可用：</p>
            <ul className="list-disc list-inside space-y-0.5 ml-2">
              <li>AI 智能续写和改写</li>
              <li>剧情建议和灵感生成</li>
              <li>角色对话生成</li>
              <li>智能大纲生成</li>
            </ul>
            <p className="mt-2 font-medium text-amber-900">
              ✓ 您仍可使用编辑、规划、导演视图等其他功能
            </p>
          </div>

          {/* 操作建议 */}
          <div className="mt-3 text-sm text-amber-700">
            <span className="font-medium">如何解决：</span>
            <ol className="list-decimal list-inside ml-2 mt-1 space-y-0.5">
              <li>点击右侧"设置"按钮</li>
              <li>在"AI 设置"中配置模型路径</li>
              <li>点击"加载模型"按钮</li>
            </ol>
          </div>
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="flex items-center gap-2 ml-4">
        {/* 重试按钮 */}
        <button
          onClick={handleRetry}
          disabled={isRetrying}
          className="px-3 py-1.5 text-sm font-medium text-amber-700 hover:text-amber-900
                   bg-white border border-amber-300 rounded-md hover:bg-amber-50
                   transition-colors disabled:opacity-50 disabled:cursor-not-allowed
                   flex items-center gap-1.5"
          title="重新检查 AI 服务状态"
        >
          <ArrowPathIcon className={`w-4 h-4 ${isRetrying ? 'animate-spin' : ''}`} />
          {isRetrying ? '检查中...' : '重试'}
        </button>

        {/* 关闭按钮 */}
        {dismissible && (
          <button
            onClick={() => setIsDismissed(true)}
            className="p-1.5 text-amber-600 hover:text-amber-900 hover:bg-amber-100
                     rounded transition-colors"
            title="关闭提示（30秒后自动重新检查）"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        )}
      </div>
    </div>
  );
}

export default AIServiceStatusBanner;
