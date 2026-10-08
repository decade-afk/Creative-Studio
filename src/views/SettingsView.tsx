/**
 * SettingsView - 完整设置面板组件
 *
 * 功能说明：
 * 1. 用户信息 - 管理用户头像、用户名、邮箱
 * 2. 外观设置 - 切换主题（浅色/深色/自动）
 * 3. 编辑器设置 - 字体、行高、自动保存等
 * 4. 快捷键配置 - 自定义键盘快捷键
 * 5. 导出设置 - 默认格式、PDF边距等
 * 6. 备份设置 - 自动备份配置
 * 7. 关于信息 - 显示应用版本和相关信息
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { ask, message } from '@tauri-apps/plugin-dialog';
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
import {
  loadConfig,
  saveConfig,
  type AppConfig,
} from '../services/configService';
import { getCurrentStorageDir, isDefaultLocation, pickStorageDir, migrateStorage, resetToDefault } from '../services/storageService';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import {
  createBackup,
  deleteBackup,
  listBackups,
  restoreBackup,
  startAutoBackupScheduler,
  formatBackupSize,
  parseBackupDate,
  type BackupInfo,
} from '../services/backupService';
import {
  AI_PROVIDER_PRESETS,
  getProviderPreset,
  aiListModels,
  aiTestConnection,
} from '../services/aiService';
import {
  getShortcuts,
  saveShortcuts,
  resetShortcuts,
  validateShortcut,
  checkConflict,
  getCategoryName,
  getActionName,
  type ShortcutConfig,
} from '../services/shortcutService';

// 设置选项卡类型
type SettingsTab = 'profile' | 'appearance' | 'ai' | 'editor' | 'shortcuts' | 'export' | 'backup' | 'storage' | 'about';

// 组件属性接口
interface SettingsViewProps {
  onClose: () => void;
}

export default function SettingsView({ onClose }: SettingsViewProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
  const { showToast, ToastComponent } = useToast();
  const { mode: themeMode, setMode: setThemeMode } = useTheme();

  // 用户信息
  const [userProfile, setUserProfile] = useState<UserProfile>({
    username: '创作者',
    email: '',
  });
  const [savingProfile, setSavingProfile] = useState(false);

  // 应用配置
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [savingConfig, setSavingConfig] = useState(false);

  // 快捷键配置
  const [shortcuts, setShortcuts] = useState<ShortcutConfig | null>(null);
  const [editingShortcut, setEditingShortcut] = useState<{ category: string; action: string } | null>(null);
  const [savingShortcuts, setSavingShortcuts] = useState(false);

  // 加载所有配置
  useEffect(() => {
    async function loadAllConfigs() {
      try {
        // 加载用户信息
        const profile = await getUserProfile();
        setUserProfile(profile);

        // 加载应用配置
        const appConfig = await loadConfig();
        setConfig(appConfig);

        // 加载快捷键配置
        const shortcutsConfig = getShortcuts();
        setShortcuts(shortcutsConfig);
      } catch (error) {
        console.error('加载配置失败:', error);
      }
    }
    loadAllConfigs();
  }, []);

  // 保存用户信息
  const handleSaveUserProfile = async () => {
    const usernameValidation = validateUsername(userProfile.username);
    if (!usernameValidation.valid) {
      showToast(usernameValidation.error || '用户名无效', 'error');
      return;
    }

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

  // 保存应用配置
  const handleSaveConfig = async () => {
    if (!config) return;

    setSavingConfig(true);
    try {
      // 外观主题由 ThemeContext 实时管理，保存时同步进配置文件，
      // 下次启动由 App 应用配置中的主题
      const configToSave = { ...config, theme: themeMode };
      await saveConfig(configToSave);
      setConfig(configToSave);

      // 备份设置可能已变更，重启调度器使其立即生效
      await startAutoBackupScheduler().catch((error) => {
        console.warn('⚠️ 重启自动备份调度器失败:', error);
      });

      // 通知编辑器等组件实时应用新配置（字体/字号/行高/自动保存间隔等）
      window.dispatchEvent(new CustomEvent('creative-studio:config-changed'));

      showToast('配置已保存', 'success');
    } catch (error: any) {
      showToast(`保存失败: ${error}`, 'error');
    } finally {
      setSavingConfig(false);
    }
  };

  // 保存快捷键配置
  const handleSaveShortcuts = async () => {
    if (!shortcuts) return;

    setSavingShortcuts(true);
    try {
      saveShortcuts(shortcuts);
      // 通知 App 重新加载自定义快捷键（立即生效）
      window.dispatchEvent(new CustomEvent('creative-studio:config-changed'));
      showToast('快捷键配置已保存', 'success');
    } catch (error: any) {
      showToast(`保存失败: ${error}`, 'error');
    } finally {
      setSavingShortcuts(false);
    }
  };

  // 重置快捷键
  const handleResetShortcuts = () => {
    const defaults = resetShortcuts();
    setShortcuts(defaults);
    showToast('快捷键已重置为默认', 'success');
  };

  // 编辑快捷键
  const handleEditShortcut = (category: string, action: string, newValue: string) => {
    if (!shortcuts) return;

    const validation = validateShortcut(newValue);
    if (!validation.valid) {
      showToast(validation.error || '快捷键格式不正确', 'error');
      return;
    }

    const conflict = checkConflict(newValue, shortcuts, `${category}.${action}`);
    if (conflict.conflict) {
      showToast(`快捷键冲突: 已被 ${conflict.conflictWith} 使用`, 'error');
      return;
    }

    setShortcuts({
      ...shortcuts,
      [category]: {
        ...shortcuts[category as keyof ShortcutConfig],
        [action]: newValue,
      },
    } as ShortcutConfig);
  };

  if (!config || !shortcuts) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center">
        <div className="bg-surface-secondary rounded-2xl shadow-2xl p-8">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 mx-auto mb-4"></div>
            <p className="text-on-surface">加载配置中...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center">
      {ToastComponent}

      <div className="bg-surface-secondary rounded-2xl shadow-2xl w-full max-w-5xl max-h-[85vh] flex overflow-hidden">
        {/* Sidebar */}
        <div className="w-64 bg-surface-secondary border-r border-outline-variant p-6">
          <h2 className="text-xl font-bold text-on-surface mb-6">设置</h2>
          <div className="space-y-2">
            {/* 用户信息 */}
            <TabButton
              icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>}
              label="用户信息"
              active={activeTab === 'profile'}
              onClick={() => setActiveTab('profile')}
            />

            {/* 外观 */}
            <TabButton
              icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
              </svg>}
              label="外观"
              active={activeTab === 'appearance'}
              onClick={() => setActiveTab('appearance')}
            />

            {/* AI 服务 */}
            <TabButton
              icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>}
              label="AI 服务"
              active={activeTab === 'ai'}
              onClick={() => setActiveTab('ai')}
            />

            {/* 编辑器 */}
            <TabButton
              icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>}
              label="编辑器"
              active={activeTab === 'editor'}
              onClick={() => setActiveTab('editor')}
            />

            {/* 快捷键 */}
            <TabButton
              icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>}
              label="快捷键"
              active={activeTab === 'shortcuts'}
              onClick={() => setActiveTab('shortcuts')}
            />

            {/* 导出 */}
            <TabButton
              icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>}
              label="导出"
              active={activeTab === 'export'}
              onClick={() => setActiveTab('export')}
            />

            {/* 备份 */}
            <TabButton
              icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
              </svg>}
              label="备份"
              active={activeTab === 'backup'}
              onClick={() => setActiveTab('backup')}
            />

            {/* 存储 */}
            <TabButton
              icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>}
              label="存储"
              active={activeTab === 'storage'}
              onClick={() => setActiveTab('storage')}
            />

            {/* 关于 */}
            <TabButton
              icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>}
              label="关于"
              active={activeTab === 'about'}
              onClick={() => setActiveTab('about')}
            />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <div className="h-16 border-b border-outline flex items-center justify-between px-6">
            <h3 className="text-lg font-semibold text-on-surface">
              {activeTab === 'profile' && '用户信息'}
              {activeTab === 'appearance' && '外观设置'}
              {activeTab === 'ai' && 'AI 服务'}
              {activeTab === 'editor' && '编辑器设置'}
              {activeTab === 'shortcuts' && '快捷键配置'}
              {activeTab === 'export' && '导出设置'}
              {activeTab === 'backup' && '备份设置'}
              {activeTab === 'storage' && '数据存储'}
              {activeTab === 'about' && '关于'}
            </h3>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg hover:bg-surface-secondary flex items-center justify-center text-on-surface-secondary hover:text-on-surface transition-colors"
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
                <ProfileTab
                  userProfile={userProfile}
                  setUserProfile={setUserProfile}
                  onUploadAvatar={handleUploadAvatar}
                />
              )}

              {/* 外观 Tab */}
              {activeTab === 'appearance' && (
                <AppearanceTab themeMode={themeMode} setThemeMode={setThemeMode} />
              )}

              {/* AI 服务 Tab */}
              {activeTab === 'ai' && <AiTab config={config} setConfig={setConfig} />}

              {/* 编辑器 Tab */}
              {activeTab === 'editor' && (
                <EditorTab config={config} setConfig={setConfig} />
              )}

              {/* 快捷键 Tab */}
              {activeTab === 'shortcuts' && (
                <ShortcutsTab
                  shortcuts={shortcuts}
                  editingShortcut={editingShortcut}
                  setEditingShortcut={setEditingShortcut}
                  onEditShortcut={handleEditShortcut}
                  onReset={handleResetShortcuts}
                />
              )}

              {/* 导出 Tab */}
              {activeTab === 'export' && (
                <ExportTab config={config} setConfig={setConfig} />
              )}

              {/* 备份 Tab */}
              {activeTab === 'backup' && (
                <BackupTab config={config} setConfig={setConfig} onNotify={showToast} />
              )}

              {/* 存储 Tab */}
              {activeTab === 'storage' && <StorageTab onNotify={showToast} />}

              {/* 关于 Tab */}
              {activeTab === 'about' && <AboutTab />}
            </div>
          </div>

          {/* Footer */}
          <div className="h-16 border-t border-outline flex items-center justify-end gap-3 px-6 bg-surface-secondary">
            <button onClick={onClose} className="btn">
              取消
            </button>
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
              <div className="text-sm text-on-surface-secondary">
                主题已自动保存
              </div>
            )}
            {(activeTab === 'editor' || activeTab === 'export' || activeTab === 'backup' || activeTab === 'ai') && (
              <button
                onClick={handleSaveConfig}
                disabled={savingConfig}
                className="btn btn-primary"
              >
                {savingConfig ? '保存中...' : '保存更改'}
              </button>
            )}
            {activeTab === 'shortcuts' && (
              <button
                onClick={handleSaveShortcuts}
                disabled={savingShortcuts}
                className="btn btn-primary"
              >
                {savingShortcuts ? '保存中...' : '保存更改'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ========== 子组件 ==========

interface TabButtonProps {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}

function TabButton({ icon, label, active, onClick }: TabButtonProps) {
  return (
    <div
      onClick={onClick}
      className={`px-4 py-3 rounded-lg font-medium cursor-pointer transition-colors ${
        active
          ? 'bg-primary-500/10 text-primary-600 border-l-3 border-primary-500'
          : 'text-on-surface-secondary hover:bg-surface-primary'
      }`}
    >
      <div className="flex items-center gap-3">
        {icon}
        <span>{label}</span>
      </div>
    </div>
  );
}

// ========== ProfileTab组件将在下一个文件中继续 ==========

// ========== Profile Tab ==========
interface ProfileTabProps {
  userProfile: UserProfile;
  setUserProfile: (profile: UserProfile) => void;
  onUploadAvatar: () => void;
}

function ProfileTab({ userProfile, setUserProfile, onUploadAvatar }: ProfileTabProps) {
  return (
    <>
      <div className="mb-8 pb-8 border-b border-outline">
        <label className="block text-sm font-medium text-on-surface mb-4">头像</label>
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
          <button onClick={onUploadAvatar} className="btn">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            <span>上传头像</span>
          </button>
        </div>
      </div>

      <div className="mb-8 pb-8 border-b border-outline">
        <label className="block text-sm font-medium text-on-surface mb-2">用户名</label>
        <input
          type="text"
          className="form-input max-w-md"
          placeholder="输入用户名"
          value={userProfile.username}
          onChange={(e) => setUserProfile({ ...userProfile, username: e.target.value })}
        />
        <p className="mt-2 text-sm text-on-surface-secondary">这将显示在您的作品中（2-20个字符）</p>
      </div>

      <div className="mb-8">
        <label className="block text-sm font-medium text-on-surface mb-2">邮箱</label>
        <input
          type="email"
          className="form-input max-w-md"
          placeholder="your@email.com"
          value={userProfile.email}
          onChange={(e) => setUserProfile({ ...userProfile, email: e.target.value })}
        />
        <p className="mt-2 text-sm text-on-surface-secondary">用于接收通知和找回密码（可选）</p>
      </div>
    </>
  );
}

// ========== Appearance Tab ==========
interface AppearanceTabProps {
  themeMode: 'light' | 'dark' | 'auto';
  setThemeMode: (mode: 'light' | 'dark' | 'auto') => void;
}

function AppearanceTab({ themeMode, setThemeMode }: AppearanceTabProps) {
  return (
    <div className="mb-8">
      <label className="block text-sm font-medium text-on-surface mb-4">主题</label>
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
            themeMode === 'light' ? 'border-primary-500' : 'border-outline'
          } bg-surface-primary flex items-center justify-center text-sm font-medium text-on-surface shadow-sm transition-all hover:border-primary-400`}>
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
            themeMode === 'dark' ? 'border-primary-500' : 'border-outline'
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
            themeMode === 'auto' ? 'border-primary-500' : 'border-outline'
          } bg-gradient-to-br from-[#1a1a1a] to-surface-primary flex items-center justify-center text-sm font-medium text-on-surface-secondary transition-all hover:border-primary-400`}>
            自动
          </div>
        </label>
      </div>
      <p className="mt-4 text-sm text-on-surface-secondary">
        {themeMode === 'auto' && '跟随系统设置自动切换主题'}
        {themeMode === 'light' && '始终使用浅色主题'}
        {themeMode === 'dark' && '始终使用深色主题'}
      </p>
    </div>
  );
}

// ========== Editor Tab ==========
interface EditorTabProps {
  config: AppConfig;
  setConfig: (config: AppConfig) => void;
}

function EditorTab({ config, setConfig }: EditorTabProps) {
  return (
    <div className="space-y-8">
      <div>
        <label className="block text-sm font-medium text-on-surface mb-2">字体大小</label>
        <input
          type="range"
          min="12"
          max="24"
          value={config.editor.fontSize}
          onChange={(e) => setConfig({
            ...config,
            editor: { ...config.editor, fontSize: parseInt(e.target.value) }
          })}
          className="w-full max-w-md"
        />
        <p className="mt-2 text-sm text-on-surface-secondary">{config.editor.fontSize}px</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-on-surface mb-2">行高</label>
        <input
          type="range"
          min="1.2"
          max="2.5"
          step="0.1"
          value={config.editor.lineHeight}
          onChange={(e) => setConfig({
            ...config,
            editor: { ...config.editor, lineHeight: parseFloat(e.target.value) }
          })}
          className="w-full max-w-md"
        />
        <p className="mt-2 text-sm text-on-surface-secondary">{config.editor.lineHeight}</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-on-surface mb-2">自动保存间隔（秒）</label>
        <input
          type="number"
          min="0"
          max="300"
          value={config.editor.autoSaveInterval}
          onChange={(e) => setConfig({
            ...config,
            editor: { ...config.editor, autoSaveInterval: parseInt(e.target.value) }
          })}
          className="form-input max-w-xs"
        />
        <p className="mt-2 text-sm text-on-surface-secondary">
          {config.editor.autoSaveInterval === 0 ? '已禁用自动保存' : `每 ${config.editor.autoSaveInterval} 秒自动保存一次`}
        </p>
      </div>

      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          id="spellCheck"
          checked={config.editor.spellCheck}
          onChange={(e) => setConfig({
            ...config,
            editor: { ...config.editor, spellCheck: e.target.checked }
          })}
          className="w-4 h-4 text-primary-500"
        />
        <label htmlFor="spellCheck" className="text-sm font-medium text-on-surface cursor-pointer">
          启用拼写检查
        </label>
      </div>

      <div>
        <label className="block text-sm font-medium text-on-surface mb-2">每日写作目标（字）</label>
        <input
          type="number"
          min="0"
          step="100"
          value={config.editor.dailyGoal}
          onChange={(e) => setConfig({
            ...config,
            editor: { ...config.editor, dailyGoal: parseInt(e.target.value) || 0 }
          })}
          className="form-input max-w-xs"
        />
        <p className="mt-2 text-sm text-on-surface-secondary">
          {config.editor.dailyGoal === 0 ? '不启用每日目标' : `每天 ${config.editor.dailyGoal} 字，完成情况显示在写作页顶栏`}
        </p>
      </div>
    </div>
  );
}

// ========== Shortcuts Tab ==========
interface ShortcutsTabProps {
  shortcuts: ShortcutConfig;
  editingShortcut: { category: string; action: string } | null;
  setEditingShortcut: (value: { category: string; action: string } | null) => void;
  onEditShortcut: (category: string, action: string, newValue: string) => void;
  onReset: () => void;
}

function ShortcutsTab({
  shortcuts,
  editingShortcut,
  setEditingShortcut,
  onEditShortcut,
  onReset
}: ShortcutsTabProps) {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center pb-4 border-b border-outline">
        <p className="text-sm text-on-surface-secondary">
          点击快捷键进行编辑，按 Enter 保存，按 Esc 取消
        </p>
        <button onClick={onReset} className="btn btn-sm">
          重置为默认
        </button>
      </div>

      {Object.keys(shortcuts).map((category) => (
        <div key={category} className="pb-6 border-b border-outline last:border-0">
          <h4 className="text-sm font-semibold text-on-surface mb-4">
            {getCategoryName(category as keyof ShortcutConfig)}
          </h4>
          <div className="space-y-3">
            {Object.entries(shortcuts[category as keyof ShortcutConfig]).map(([action, shortcut]) => (
              <div key={action} className="flex items-center justify-between">
                <span className="text-sm text-on-surface">{getActionName(category, action)}</span>
                <ShortcutInput
                  category={category}
                  action={action}
                  value={shortcut as string}
                  isEditing={editingShortcut?.category === category && editingShortcut?.action === action}
                  onEdit={() => setEditingShortcut({ category, action })}
                  onSave={(newValue) => {
                    onEditShortcut(category, action, newValue);
                    setEditingShortcut(null);
                  }}
                  onCancel={() => setEditingShortcut(null)}
                />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

interface ShortcutInputProps {
  category: string;
  action: string;
  value: string;
  isEditing: boolean;
  onEdit: () => void;
  onSave: (value: string) => void;
  onCancel: () => void;
}

function ShortcutInput({ value, isEditing, onEdit, onSave, onCancel }: ShortcutInputProps) {
  const [inputValue, setInputValue] = useState(value);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  if (!isEditing) {
    return (
      <button
        onClick={onEdit}
        className="px-3 py-1.5 bg-surface-tertiary rounded border border-outline text-sm font-mono text-on-surface hover:bg-surface-secondary transition-colors"
      >
        {value}
      </button>
    );
  }

  return (
    <input
      type="text"
      value={inputValue}
      onChange={(e) => setInputValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          onSave(inputValue);
        } else if (e.key === 'Escape') {
          onCancel();
        }
      }}
      onBlur={() => onSave(inputValue)}
      autoFocus
      className="px-3 py-1.5 bg-surface-tertiary rounded border-2 border-primary-500 text-sm font-mono text-on-surface focus:outline-none"
    />
  );
}

// ========== Export Tab ==========
interface ExportTabProps {
  config: AppConfig;
  setConfig: (config: AppConfig) => void;
}

function ExportTab({ config, setConfig }: ExportTabProps) {
  return (
    <div className="space-y-8">
      <div>
        <label className="block text-sm font-medium text-on-surface mb-3">默认导出格式</label>
        <div className="grid grid-cols-2 gap-3 max-w-md">
          {[
            { value: 'txt', label: 'TXT', desc: '纯文本' },
            { value: 'pdf', label: 'PDF', desc: 'PDF文档' },
            { value: 'word', label: 'Word', desc: 'Word文档' },
            { value: 'markdown', label: 'Markdown', desc: 'MD文件' },
          ].map((format) => (
            <label key={format.value} className="cursor-pointer">
              <input
                type="radio"
                name="exportFormat"
                className="sr-only"
                checked={config.export.defaultFormat === format.value}
                onChange={() => setConfig({
                  ...config,
                  export: { ...config.export, defaultFormat: format.value as any }
                })}
              />
              <div className={`p-3 border-2 rounded-lg transition-all ${
                config.export.defaultFormat === format.value
                  ? 'border-primary-500 bg-primary-50'
                  : 'border-outline hover:border-primary-300'
              }`}>
                <div className="font-semibold text-sm text-on-surface">{format.label}</div>
                <div className="text-xs text-on-surface-secondary mt-1">{format.desc}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-on-surface mb-3">PDF 页边距（毫米）</label>
        <div className="grid grid-cols-2 gap-4 max-w-md">
          {[
            { key: 'top', label: '上边距' },
            { key: 'bottom', label: '下边距' },
            { key: 'left', label: '左边距' },
            { key: 'right', label: '右边距' },
          ].map((margin) => (
            <div key={margin.key}>
              <label className="block text-xs text-on-surface-secondary mb-1">{margin.label}</label>
              <input
                type="number"
                min="10"
                max="50"
                value={config.export.pdfMargins[margin.key as keyof typeof config.export.pdfMargins]}
                onChange={(e) => setConfig({
                  ...config,
                  export: {
                    ...config.export,
                    pdfMargins: {
                      ...config.export.pdfMargins,
                      [margin.key]: parseInt(e.target.value)
                    }
                  }
                })}
                className="form-input w-full"
              />
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          id="includeMetadata"
          checked={config.export.includeMetadata}
          onChange={(e) => setConfig({
            ...config,
            export: { ...config.export, includeMetadata: e.target.checked }
          })}
          className="w-4 h-4 text-primary-500"
        />
        <label htmlFor="includeMetadata" className="text-sm font-medium text-on-surface cursor-pointer">
          导出时包含作者信息和元数据
        </label>
      </div>
    </div>
  );
}

// ========== Backup Tab ==========
interface BackupTabProps {
  config: AppConfig;
  setConfig: (config: AppConfig) => void;
  onNotify: (message: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
}

function BackupTab({ config, setConfig, onNotify }: BackupTabProps) {
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [backingUp, setBackingUp] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);

  // 加载备份列表
  const refreshBackups = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listBackups();
      setBackups(list);
    } catch (error) {
      console.error('加载备份列表失败:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshBackups();
  }, [refreshBackups]);

  // 立即备份
  const handleBackupNow = async () => {
    setBackingUp(true);
    try {
      const info = await createBackup();
      onNotify(`备份成功（${formatBackupSize(info.size)}）`, 'success');
      await refreshBackups();
      // createBackup 更新了配置中的 lastBackupAt，重新加载配置以刷新显示
      const freshConfig = await loadConfig();
      setConfig(freshConfig);
    } catch (error: any) {
      onNotify(`备份失败: ${error}`, 'error');
    } finally {
      setBackingUp(false);
    }
  };

  // 删除备份
  const handleDelete = async (name: string) => {
    const confirmed = await ask(`确定删除备份 ${name} 吗？此操作不可恢复。`, {
      title: '删除备份',
      kind: 'warning',
    });
    if (!confirmed) return;

    try {
      await deleteBackup(name);
      onNotify('备份已删除', 'success');
      await refreshBackups();
    } catch (error: any) {
      onNotify(`删除失败: ${error}`, 'error');
    }
  };

  // 从备份恢复
  const handleRestore = async (name: string) => {
    const confirmed = await ask(
      `确定从备份 ${name} 恢复吗？\n\n当前所有作品和章节数据将被备份时的数据完全覆盖，且无法撤销。`,
      { title: '恢复备份', kind: 'warning' }
    );
    if (!confirmed) return;

    setRestoring(name);
    try {
      await restoreBackup(name);
      await message('恢复完成，应用即将重新加载。', { title: '恢复备份', kind: 'info' });
      // 数据库文件已替换，内存中的 store 数据已失效，重载应用重新初始化
      window.location.reload();
    } catch (error: any) {
      onNotify(`恢复失败: ${error}`, 'error');
      setRestoring(null);
    }
  };

  // 格式化备份时间显示
  const formatBackupTime = (name: string): string => {
    const date = parseBackupDate(name);
    if (!date) return '未知时间';
    const pad = (n: number) => String(n).padStart(2, '0');
    return (
      `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
      ` ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
    );
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          id="backupEnabled"
          checked={config.backup.enabled}
          onChange={(e) => setConfig({
            ...config,
            backup: { ...config.backup, enabled: e.target.checked }
          })}
          className="w-4 h-4 text-primary-500"
        />
        <label htmlFor="backupEnabled" className="text-sm font-medium text-on-surface cursor-pointer">
          启用自动备份
        </label>
      </div>

      {config.backup.enabled && (
        <>
          <div>
            <label className="block text-sm font-medium text-on-surface mb-2">备份间隔（小时）</label>
            <input
              type="number"
              min="1"
              max="168"
              value={config.backup.interval}
              onChange={(e) => setConfig({
                ...config,
                backup: { ...config.backup, interval: parseInt(e.target.value) }
              })}
              className="form-input max-w-xs"
            />
            <p className="mt-2 text-sm text-on-surface-secondary">
              每 {config.backup.interval} 小时自动备份一次
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-on-surface mb-2">保留备份数量</label>
            <input
              type="number"
              min="1"
              max="30"
              value={config.backup.keepCount}
              onChange={(e) => setConfig({
                ...config,
                backup: { ...config.backup, keepCount: parseInt(e.target.value) }
              })}
              className="form-input max-w-xs"
            />
            <p className="mt-2 text-sm text-on-surface-secondary">
              保留最近 {config.backup.keepCount} 个备份文件
            </p>
          </div>
        </>
      )}

      {/* 手动备份与备份列表 */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold text-on-surface">备份文件</h4>
          <div className="flex items-center gap-2">
            {config.backup.lastBackupAt && (
              <span className="text-xs text-on-surface-secondary">
                上次备份：{new Date(config.backup.lastBackupAt).toLocaleString()}
              </span>
            )}
            <button
              onClick={handleBackupNow}
              disabled={backingUp}
              className="px-3 py-1.5 text-sm rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {backingUp ? '备份中...' : '立即备份'}
            </button>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-on-surface-secondary py-4 text-center">加载中...</p>
        ) : backups.length === 0 ? (
          <p className="text-sm text-on-surface-secondary py-4 text-center">
            暂无备份，点击"立即备份"创建第一个备份
          </p>
        ) : (
          <div className="border border-surface-border rounded-lg divide-y divide-surface-border max-h-64 overflow-y-auto">
            {backups.map((backup) => (
              <div key={backup.name} className="flex items-center justify-between px-4 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm text-on-surface truncate">{formatBackupTime(backup.name)}</p>
                  <p className="text-xs text-on-surface-secondary">{formatBackupSize(backup.size)}</p>
                </div>
                <div className="flex items-center gap-2 ml-4 shrink-0">
                  <button
                    onClick={() => handleRestore(backup.name)}
                    disabled={restoring !== null}
                    className="px-2.5 py-1 text-xs rounded-md border border-primary-300 text-primary-600 hover:bg-primary-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {restoring === backup.name ? '恢复中...' : '恢复'}
                  </button>
                  <button
                    onClick={() => handleDelete(backup.name)}
                    disabled={restoring !== null}
                    className="px-2.5 py-1 text-xs rounded-md border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="p-4 bg-primary-50 rounded-lg border border-primary-200">
        <h4 className="text-sm font-semibold text-on-surface mb-2">备份说明</h4>
        <ul className="text-sm text-on-surface-secondary space-y-1 list-disc list-inside">
          <li>备份文件存储在应用数据目录的 backups 文件夹</li>
          <li>包含所有作品和章节的完整数据（在线快照，无需退出应用）</li>
          <li>超过保留数量的旧备份会自动删除</li>
          <li>恢复备份会覆盖当前全部数据，恢复前请谨慎确认</li>
        </ul>
      </div>
    </div>
  );
}

// ========== AI 服务 Tab ==========
interface AiTabProps {
  config: AppConfig | null;
  setConfig: (config: AppConfig) => void;
}

/**
 * AI 服务配置页
 *
 * 【说明】
 * 选择服务商预设后自动填充 Base URL 与默认模型；
 * 本地服务（LM Studio / Ollama）可通过"获取模型列表"自动发现模型。
 * 保存后由 AI 助手面板直接生效（Rust 后端转发请求，无 CORS 限制）。
 */
function AiTab({ config, setConfig }: AiTabProps) {
  const { showToast } = useToast();

  const [models, setModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [testing, setTesting] = useState(false);

  if (!config) return null;

  const ai = config.ai;
  const preset = getProviderPreset(ai.provider);

  const updateAi = (patch: Partial<AppConfig['ai']>) => {
    setConfig({ ...config, ai: { ...ai, ...patch } });
  };

  /** 切换预设：填充 Base URL 与默认模型 */
  const handlePresetChange = (providerId: string) => {
    const next = getProviderPreset(providerId);
    if (!next) return;
    setModels([]);
    updateAi({ provider: providerId, baseUrl: next.baseUrl, model: next.defaultModel });
  };

  /** 拉取服务商可用模型 */
  const handleFetchModels = async () => {
    if (!ai.baseUrl) {
      showToast('请先填写 API 地址', 'warning');
      return;
    }
    setLoadingModels(true);
    try {
      const list = await aiListModels(ai.baseUrl, ai.apiKey);
      setModels(list);
      if (list.length === 0) showToast('服务未返回模型列表', 'info');
    } catch (error: any) {
      showToast(error.message || '获取模型列表失败', 'error');
    } finally {
      setLoadingModels(false);
    }
  };

  /** 测试连通性 */
  const handleTest = async () => {
    if (!ai.baseUrl || !ai.model) {
      showToast('请先填写 API 地址和模型', 'warning');
      return;
    }
    setTesting(true);
    try {
      const reply = await aiTestConnection(ai);
      showToast(`连接正常，模型回复：${reply.slice(0, 30)}`, 'success');
    } catch (error: any) {
      showToast(error.message || '连接失败', 'error');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="p-4 bg-primary-50 rounded-lg border border-primary-200 text-sm text-on-surface-secondary">
        配置任意 OpenAI 兼容服务后，即可在写作页使用 AI 续写、润色、摘要与审稿。
        API Key 仅保存在本机配置文件中，请求由应用后端直接转发，不经过任何第三方。
      </div>

      {/* 服务商预设 */}
      <div>
        <label className="block text-sm font-medium text-on-surface mb-2">服务商</label>
        <select
          value={ai.provider}
          onChange={(e) => handlePresetChange(e.target.value)}
          className="form-input max-w-xs"
        >
          {AI_PROVIDER_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        {preset?.hint && (
          <p className="mt-2 text-xs text-on-surface-secondary">{preset.hint}</p>
        )}
      </div>

      {/* API 地址 */}
      <div>
        <label className="block text-sm font-medium text-on-surface mb-2">API 地址（Base URL）</label>
        <input
          type="text"
          value={ai.baseUrl}
          onChange={(e) => updateAi({ baseUrl: e.target.value })}
          placeholder="https://api.example.com/v1"
          className="form-input max-w-lg"
        />
      </div>

      {/* API Key */}
      <div>
        <label className="block text-sm font-medium text-on-surface mb-2">API Key</label>
        <input
          type="password"
          value={ai.apiKey}
          onChange={(e) => updateAi({ apiKey: e.target.value })}
          placeholder={preset?.requiresApiKey ? '必填' : '本地服务通常无需填写'}
          className="form-input max-w-lg"
          autoComplete="off"
        />
      </div>

      {/* 模型 */}
      <div>
        <label className="block text-sm font-medium text-on-surface mb-2">模型</label>
        <div className="flex items-center gap-2 max-w-lg">
          {models.length > 0 ? (
            <select
              value={ai.model}
              onChange={(e) => updateAi({ model: e.target.value })}
              className="form-input flex-1"
            >
              {!models.includes(ai.model) && <option value={ai.model}>{ai.model || '请选择模型'}</option>}
              {models.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={ai.model}
              onChange={(e) => updateAi({ model: e.target.value })}
              placeholder="如 moonshot-v1-8k / deepseek-chat / glm-4-plus"
              className="form-input flex-1"
            />
          )}
          <button
            onClick={handleFetchModels}
            disabled={loadingModels}
            className="px-3 py-2 text-xs rounded-lg border border-surface-border text-on-surface hover:bg-surface-secondary disabled:opacity-50 whitespace-nowrap"
          >
            {loadingModels ? '获取中…' : '获取模型列表'}
          </button>
        </div>
      </div>

      {/* 生成参数 */}
      <div className="grid grid-cols-2 gap-4 max-w-lg">
        <div>
          <label className="block text-sm font-medium text-on-surface mb-2">温度（{ai.temperature}）</label>
          <input
            type="range"
            min="0"
            max="2"
            step="0.1"
            value={ai.temperature}
            onChange={(e) => updateAi({ temperature: parseFloat(e.target.value) })}
            className="w-full"
          />
          <p className="text-xs text-on-surface-secondary mt-1">越低越稳定，越高越发散</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-on-surface mb-2">最大 Token</label>
          <input
            type="number"
            min="256"
            max="32000"
            step="256"
            value={ai.maxTokens}
            onChange={(e) => updateAi({ maxTokens: parseInt(e.target.value) || 2048 })}
            className="form-input"
          />
        </div>
      </div>

      {/* 测试 */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleTest}
          disabled={testing}
          className="px-4 py-2 text-sm rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
        >
          {testing ? '测试中…' : '测试连接'}
        </button>
        <p className="text-xs text-on-surface-secondary">发送一条极短消息验证服务可用性</p>
      </div>
    </div>
  );
}

// ========== About Tab ==========
function AboutTab() {
  return (
    <div className="py-8">
      <div className="text-center mb-10">
        <div className="text-6xl mb-4">🎬</div>
        <h3 className="text-2xl font-bold text-on-surface mb-2">Creative Studio</h3>
        <p className="text-sm text-on-surface-secondary mb-6">版本 0.3.0</p>
        <p className="text-sm text-on-surface-secondary max-w-md mx-auto mb-8">
          专业创作工作室，支持剧本创作、大纲管理、分镜生成等功能
        </p>
      </div>

      {/* 软件更新 */}
      <div className="max-w-2xl mx-auto mb-6">
        <UpdateSection />
      </div>

      <div className="space-y-6 max-w-2xl mx-auto">
        <div className="p-4 bg-primary-50 rounded-lg border border-primary-200">
          <h4 className="text-sm font-semibold text-on-surface mb-3">技术栈</h4>
          <div className="grid grid-cols-2 gap-3 text-sm text-on-surface-secondary">
            <div className="flex items-center gap-2">
              <span className="text-primary-500">⚡</span>
              <span>Tauri 2.0 + Rust</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-primary-500">⚛️</span>
              <span>React 18 + TypeScript</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-primary-500">💾</span>
              <span>SQLite 数据库</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-primary-500">🎨</span>
              <span>Tailwind CSS</span>
            </div>
          </div>
        </div>

        <div className="p-4 bg-accent-50 rounded-lg border border-accent-200">
          <h4 className="text-sm font-semibold text-on-surface mb-3">核心功能</h4>
          <div className="space-y-2 text-sm text-on-surface-secondary">
            <div className="flex items-start gap-2">
              <span className="text-accent-500 mt-1">📝</span>
              <span>剧本/小说创作与管理</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-accent-500 mt-1">📋</span>
              <span>大纲规划与角色管理</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-accent-500 mt-1">🎬</span>
              <span>分镜脚本与素材库</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-accent-500 mt-1">🌙</span>
              <span>自定义主题（浅色/深色/自动）</span>
            </div>
          </div>
        </div>

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

        <div className="text-center text-xs text-on-surface-secondary pt-6 border-t border-outline">
          <p>© 2025 Creative Studio. All rights reserved.</p>
          <p className="mt-1">Open source project under MIT License</p>
        </div>
      </div>
    </div>
  );
}

// ========== 存储 Tab ==========
function StorageTab({ onNotify }: { onNotify: (msg: string, type?: 'success' | 'error' | 'warning' | 'info') => void }) {
  const [currentDir, setCurrentDir] = useState('');
  const [isDefault, setIsDefault] = useState(true);
  const [migrating, setMigrating] = useState(false);

  useEffect(() => {
    getCurrentStorageDir().then(setCurrentDir).catch(() => undefined);
    isDefaultLocation().then(setIsDefault).catch(() => undefined);
  }, []);

  const handlePick = async () => {
    const dir = await pickStorageDir();
    if (!dir) return; // 取消或选了应用数据目录
    const confirmed = await ask(
      `将把全部小说数据（数据库、备份、素材）迁移到：\n\n${dir}\n\n旧位置的数据会保留作为备份。迁移后建议重启应用。确定继续？`,
      { title: '迁移数据', kind: 'info' }
    );
    if (!confirmed) return;

    setMigrating(true);
    try {
      const result = await migrateStorage(dir);
      setCurrentDir(dir);
      setIsDefault(false);
      onNotify(
        `迁移完成（${result.moved.length} 项${result.skipped.length ? `，跳过 ${result.skipped.length} 项` : ''}），建议重启应用以完全生效`,
        'success'
      );
    } catch (error: any) {
      onNotify(error.message || '迁移失败', 'error');
    } finally {
      setMigrating(false);
    }
  };

  const handleReset = async () => {
    const confirmed = await ask('把数据移回默认位置（应用数据目录）？旧位置数据保留。', { title: '恢复默认', kind: 'info' });
    if (!confirmed) return;
    setMigrating(true);
    try {
      await resetToDefault();
      setCurrentDir(await getCurrentStorageDir());
      setIsDefault(true);
      onNotify('已恢复默认位置，建议重启应用', 'success');
    } catch (error: any) {
      onNotify(error.message || '操作失败', 'error');
    } finally {
      setMigrating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="p-4 bg-primary-50 rounded-lg border border-primary-200 text-sm text-on-surface-secondary">
        小说正文、大纲、角色、备份与素材全部存储在下面的位置。config.json（界面设置）始终保留在系统应用数据目录。
      </div>

      <div>
        <label className="block text-sm font-medium text-on-surface mb-2">当前存储位置</label>
        <div className="flex items-center gap-2">
          <code className="flex-1 px-3 py-2 bg-surface-secondary border border-outline rounded-lg text-xs text-on-surface break-all">
            {currentDir || '加载中…'}
          </code>
          <button
            onClick={() => currentDir && revealItemInDir(currentDir).catch(() => onNotify('打开失败', 'error'))}
            className="px-3 py-2 text-xs rounded-lg border border-outline text-on-surface hover:bg-surface-secondary whitespace-nowrap"
          >
            打开文件夹
          </button>
        </div>
        <p className="mt-2 text-xs text-on-surface-secondary">
          {isDefault ? '当前使用系统默认位置' : '当前使用自定义位置'}
        </p>
      </div>

      <div className="flex gap-3">
        <button
          onClick={handlePick}
          disabled={migrating}
          className="px-4 py-2 text-sm rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
        >
          {migrating ? '迁移中…' : '更改位置并迁移数据…'}
        </button>
        {!isDefault && (
          <button
            onClick={handleReset}
            disabled={migrating}
            className="px-4 py-2 text-sm rounded-lg border border-outline text-on-surface hover:bg-surface-secondary disabled:opacity-50"
          >
            恢复默认位置
          </button>
        )}
      </div>

      <div className="p-4 bg-surface-secondary rounded-lg border border-outline text-xs text-on-surface-secondary space-y-1">
        <p>· 迁移采用复制而非移动——旧位置数据完整保留，可随时切回</p>
        <p>· 迁移包含：creative-studio.db（数据库）、backups/（备份）、assets/（素材）</p>
        <p>· 迁移后建议重启应用，让所有组件加载新路径</p>
      </div>
    </div>
  );
}

// ========== 软件更新区块 ==========
function UpdateSection() {
  const [state, setState] = useState<'idle' | 'checking' | 'available' | 'uptodate' | 'downloading' | 'ready'>('idle');
  const [newVersion, setNewVersion] = useState('');
  const [progress, setProgress] = useState({ received: 0, total: 0 });
  const updateRef = useRef<any>(null);

  const handleCheck = async () => {
    setState('checking');
    const { checkForUpdates } = await import('../services/updateService');
    const result = await checkForUpdates();
    if (result.available && result.update) {
      updateRef.current = result.update;
      setNewVersion(result.version || '');
      setState('available');
    } else {
      setState('uptodate');
    }
  };

  const handleInstall = async () => {
    if (!updateRef.current) return;
    setState('downloading');
    try {
      const { downloadAndInstall } = await import('../services/updateService');
      await downloadAndInstall(updateRef.current, (received, total) => {
        setProgress({ received, total: total || 0 });
      });
      // relaunch 会重启应用，这里不会走到
      setState('ready');
    } catch {
      setState('idle');
    }
  };

  const openReleases = async () => {
    const { openReleasesPage } = await import('../services/updateService');
    await openReleasesPage().catch(() => undefined);
  };

  const pct = progress.total > 0 ? Math.round((progress.received / progress.total) * 100) : 0;

  return (
    <div className="p-4 bg-surface-secondary rounded-lg border border-outline">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-on-surface">🔄 软件更新</h4>
        <button
          onClick={openReleases}
          className="text-xs text-primary-600 hover:underline"
        >
          更新日志 / 手动下载
        </button>
      </div>

      {state === 'idle' && (
        <button
          onClick={handleCheck}
          className="px-4 py-2 text-sm rounded-lg bg-primary-600 text-white hover:bg-primary-700"
        >
          检查更新
        </button>
      )}

      {state === 'checking' && <p className="text-sm text-on-surface-secondary">正在检查…</p>}

      {state === 'uptodate' && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-green-600 dark:text-green-400">✓ 已是最新版本</span>
          <button onClick={handleCheck} className="text-xs text-on-surface-secondary hover:text-on-surface">再查一次</button>
        </div>
      )}

      {state === 'available' && (
        <div className="space-y-3">
          <p className="text-sm text-on-surface">
            发现新版本 <span className="font-semibold text-primary-600">v{newVersion}</span>
          </p>
          <button
            onClick={handleInstall}
            className="px-4 py-2 text-sm rounded-lg bg-primary-600 text-white hover:bg-primary-700"
          >
            立即更新（下载并重启）
          </button>
        </div>
      )}

      {state === 'downloading' && (
        <div className="space-y-2">
          <p className="text-sm text-on-surface-secondary">下载中… {pct}%</p>
          <div className="w-full h-2 bg-surface-tertiary rounded-full overflow-hidden">
            <div className="h-full bg-primary-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      <p className="mt-3 text-xs text-on-surface-secondary">
        更新包经签名校验后自动安装；若提示检查失败或无签名，可点右上角手动下载安装
      </p>
    </div>
  );
}
