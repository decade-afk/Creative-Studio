/**
 * Toast 通知组件
 *
 * 功能说明：
 * - 用于显示成功/错误/警告/信息消息
 * - 自动在指定时间后消失（默认3秒）
 * - 支持手动关闭
 * - 显示在屏幕右上角，带有滑入动画
 *
 * 使用方法：
 * const { showToast, ToastComponent } = useToast();
 * showToast('操作成功', 'success');
 */

import { useEffect, useState, useCallback } from 'react';

// Toast 类型定义
export type ToastType = 'success' | 'error' | 'warning' | 'info';

// Toast 组件属性接口
export interface ToastProps {
  message: string;        // 要显示的消息文本
  type: ToastType;        // 消息类型（决定颜色和图标）
  onClose: () => void;    // 关闭回调函数
  duration?: number;      // 自动关闭时间（毫秒），默认3000ms
}

/**
 * Toast 通知组件
 *
 * @param message - 显示的消息内容
 * @param type - 消息类型（success/error/warning/info）
 * @param onClose - 关闭时的回调函数
 * @param duration - 自动关闭的延迟时间（毫秒）
 */
export default function Toast({ message, type, onClose, duration = 3000 }: ToastProps) {
  /**
   * 自动关闭定时器
   * 注意：这里不将 onClose 加入依赖数组，因为：
   * 1. onClose 在组件生命周期内是稳定的（来自 useToast hook）
   * 2. 我们只希望在组件挂载时设置一次定时器
   * 3. 如果加入 onClose，可能会因为引用变化导致定时器重新设置
   */
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, duration);

    // 清理函数：组件卸载时清除定时器
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duration]); // 只依赖 duration，onClose 保持稳定

  /**
   * 根据消息类型确定背景颜色
   * success - 绿色
   * error - 红色
   * warning - 橙色
   * info - 蓝色
   */
  const bgColor = {
    success: 'bg-green-500',
    error: 'bg-red-500',
    warning: 'bg-orange-500',
    info: 'bg-blue-500',
  }[type];

  /**
   * 根据消息类型确定图标
   */
  const icon = {
    success: '✓',  // 成功 - 对勾
    error: '✕',    // 错误 - 叉号
    warning: '⚠',  // 警告 - 警告符号
    info: 'ℹ',     // 信息 - 信息符号
  }[type];

  return (
    <div
      className={`fixed top-4 right-4 ${bgColor} text-white px-6 py-3 rounded-lg shadow-lg flex items-center gap-3 z-[10000] animate-slide-in`}
      style={{
        animation: 'slideIn 0.3s ease-out',
      }}
    >
      {/* 图标 */}
      <span className="text-lg font-bold">{icon}</span>

      {/* 消息文本 */}
      <span className="text-sm font-medium">{message}</span>

      {/* 关闭按钮 */}
      <button
        onClick={onClose}
        className="ml-2 hover:opacity-80 transition-opacity"
        aria-label="关闭通知"
      >
        ✕
      </button>
    </div>
  );
}

/**
 * Toast 管理 Hook
 *
 * 功能说明：
 * - 管理 Toast 的显示和隐藏
 * - 返回 showToast 函数用于显示通知
 * - 返回 ToastComponent 用于渲染
 *
 * 使用示例：
 * ```tsx
 * const { showToast, ToastComponent } = useToast();
 *
 * // 在 JSX 中渲染
 * return (
 *   <div>
 *     {ToastComponent}
 *     <button onClick={() => showToast('保存成功', 'success')}>保存</button>
 *   </div>
 * );
 * ```
 *
 * 注意事项：
 * - 同时只能显示一个 Toast
 * - 新的 Toast 会替换旧的 Toast
 * - Toast 会在 duration 时间后自动消失
 */
export function useToast() {
  // Toast 状态：保存当前显示的消息和类型
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);

  /**
   * 显示 Toast 通知
   *
   * @param message - 要显示的消息内容
   * @param type - 消息类型，默认为 'info'
   *
   * 注意：调用此函数会替换当前正在显示的 Toast（如果有）
   */
  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    setToast({ message, type });
  }, []); // 空依赖数组，函数引用保持稳定

  /**
   * 隐藏 Toast 通知
   * 通常由 Toast 组件在自动关闭或手动关闭时调用
   */
  const hideToast = useCallback(() => {
    setToast(null);
  }, []); // 空依赖数组，函数引用保持稳定

  /**
   * Toast 组件
   * 如果 toast 状态为 null，则不渲染任何内容
   */
  const ToastComponent = toast ? (
    <Toast message={toast.message} type={toast.type} onClose={hideToast} />
  ) : null;

  return {
    showToast,    // 显示 Toast 的函数
    hideToast,    // 隐藏 Toast 的函数
    ToastComponent, // Toast 组件（需要在 JSX 中渲染）
  };
}
