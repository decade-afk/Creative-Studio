/**
 * 字数统计工具
 *
 * 统计规则与编辑器保持一致：
 * - 中文字符每个计 1
 * - 英文单词按连续字母计 1
 * - 忽略 HTML 标签与所有空白字符
 */
export function calculateWordCount(content: string): number {
  const text = content.replace(/<[^>]*>/g, '');
  const chineseChars = text.match(/[\u4e00-\u9fa5]/g) || [];
  const englishWords = text.match(/[a-zA-Z]+/g) || [];
  return chineseChars.length + englishWords.length;
}
