/**
 * 每日写作统计工具
 *
 * 以"当日首次打开应用时的全书字数"为基线，
 * 今日字数 = 当前全书字数 - 基线（按自然日重置，localStorage 持久化）。
 */

const KEY_PREFIX = 'cs-daily-';

/** 当日日期键（YYYY-MM-DD，本地时区） */
function todayKey(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * 获取今日写作字数
 *
 * 首次调用时记录基线；跨天后自动重置
 *
 * @param totalNow 当前全书总字数
 * @returns 今日已写字数（不小于 0）
 */
export function getTodayWords(totalNow: number): number {
  const key = KEY_PREFIX + todayKey();
  try {
    const stored = localStorage.getItem(key);
    if (stored === null) {
      localStorage.setItem(key, String(totalNow));
      return 0;
    }
    const baseline = Number(stored);
    if (Number.isNaN(baseline)) {
      localStorage.setItem(key, String(totalNow));
      return 0;
    }
    return Math.max(0, totalNow - baseline);
  } catch {
    // localStorage 不可用时返回 0
    return 0;
  }
}
