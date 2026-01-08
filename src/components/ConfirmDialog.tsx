/**
 * ConfirmDialog 确认对话框组�?
 *
 * 功能说明�?
 * - 用于确认删除等危险操�?
 * - 支持键盘操作（Enter 确认，ESC 取消�?
 * - 支持点击背景关闭（但为了防止误操作，对于危险操作禁用此功能）
 * - 带有动画效果
 *
 * 使用方法�?
 * <ConfirmDialog
 *   title="删除作品"
 *   message="确定要删除这个作品吗�?
 *   type="danger"
 *   onConfirm={handleDelete}
 *   onCancel={() => setShowDialog(false)}
 * />
 */

import { useEffect } from 'react';

// 对话框属性接�?
export interface ConfirmDialogProps {
  title: string;          // 对话框标�?
  message: string;        // 确认消息内容
  confirmText?: string;   // 确认按钮文本，默�?确认"
  cancelText?: string;    // 取消按钮文本，默�?取消"
  onConfirm: () => void;  // 确认回调函数
  onCancel: () => void;   // 取消回调函数
  type?: 'danger' | 'warning' | 'info';  // 对话框类型（影响确认按钮颜色�?
}

/**
 * ConfirmDialog 确认对话框组�?
 *
 * @param title - 对话框标�?
 * @param message - 确认消息内容
 * @param confirmText - 确认按钮文本
 * @param cancelText - 取消按钮文本
 * @param onConfirm - 确认时的回调函数
 * @param onCancel - 取消时的回调函数
 * @param type - 对话框类型（danger/warning/info�?
 */
export default function ConfirmDialog({
  title,
  message,
  confirmText = '确认',
  cancelText = '取消',
  onConfirm,
  onCancel,
  type = 'danger',
}: ConfirmDialogProps) {
  /**
   * 键盘事件处理
   * - ESC 键：取消操作
   * - Enter 键：确认操作
   *
   * 注意：这提供了良好的键盘可访问�?
   */
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // ESC �?- 取消
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
      }
      // Enter �?- 确认（但为了安全，对�?danger 类型不启用）
      // 这可以防止用户误�?Enter 键造成不可逆操�?
      else if (event.key === 'Enter' && type !== 'danger') {
        event.preventDefault();
        onConfirm();
      }
    };

    // 添加事件监听�?
    window.addEventListener('keydown', handleKeyDown);

    // 清理函数：移除事件监听器
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onConfirm, onCancel, type]);

  /**
   * 根据对话框类型确定确认按钮样�?
   * - danger（危险）: 红色，用于删除等不可逆操�?
   * - warning（警告）: 橙色，用于需要注意的操作
   * - info（信息）: 主题色，用于普通确�?
   */
  const confirmButtonClass =
    type === 'danger'
      ? 'bg-red-500 hover:bg-red-600 text-white'
      : type === 'warning'
      ? 'bg-orange-500 hover:bg-orange-600 text-white'
      : 'bg-primary-500 hover:bg-primary-600 text-white';

  /**
   * 处理背景点击
   * 对于危险操作（danger），禁用点击背景关闭，防止误操作
   * 对于其他类型，允许点击背景关�?
   */
  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // 只有点击的是背景本身（不是对话框内容）时才关�?
    if (e.target === e.currentTarget) {
      // 危险操作不允许点击背景关�?
      if (type !== 'danger') {
        onCancel();
      }
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]"
      onClick={handleBackdropClick}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 animate-scale-in"
        style={{
          animation: 'scaleIn 0.2s ease-out',
        }}
        onClick={(e) => e.stopPropagation()} // 阻止对话框内部点击冒泡到背景
      >
        {/* 标题�?*/}
        <div className="px-6 py-4 border-b border-outline">
          <h3 className="text-lg font-semibold text-on-surface">{title}</h3>
        </div>

        {/* 消息内容 */}
        <div className="px-6 py-4">
          <p className="text-on-surface-secondary leading-relaxed">{message}</p>
        </div>

        {/* 底部按钮�?*/}
        <div className="px-6 py-4 border-t border-outline flex justify-end gap-3">
          {/* 取消按钮 */}
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-sm font-medium text-on-surface-variant hover:bg-surface-primary transition-colors"
            type="button"
          >
            {cancelText}
          </button>

          {/* 确认按钮 */}
          <button
            onClick={onConfirm}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${confirmButtonClass}`}
            type="button"
            autoFocus // 自动聚焦到确认按钮（除了 danger 类型�?
          >
            {confirmText}
          </button>
        </div>

        {/* 键盘提示（仅在非危险操作时显示） */}
        {type !== 'danger' && (
          <div className="px-6 pb-3 text-xs text-on-surface-secondary text-center">
            提示：按 <kbd className="px-1 py-0.5 bg-surface-secondary rounded">ESC</kbd> 取消�?
            <kbd className="px-1 py-0.5 bg-surface-secondary rounded">Enter</kbd> 确认
          </div>
        )}
        {type === 'danger' && (
          <div className="px-6 pb-3 text-xs text-red-500 text-center">
            危险操作：请点击按钮确认（按 <kbd className="px-1 py-0.5 bg-surface-secondary rounded">ESC</kbd> 可取消）
          </div>
        )}
      </div>
    </div>
  );
}
