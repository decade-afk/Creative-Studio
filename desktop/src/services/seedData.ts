/**
 * 测试数据种子
 *
 * 用于开发和测试环境，快速创建示例数据
 * 包含：
 * - 短剧作品示例
 * - 小说作品示例
 * - 对应的章节内容
 */

import { createWork } from './workService';
import { createChapter } from './chapterService';
import type { WorkType } from '../types/storage';

/**
 * 创建测试数据
 * 包含2个短剧作品和1个小说作品，每个作品有3个章节
 *
 * @returns Promise<void>
 */
export async function seedTestData(): Promise<void> {
  console.log('🌱 开始创建测试数据...');

  try {
    // ========== 短剧1: 霸道总裁爱上我 ==========
    const script1 = await createWork(
      '霸道总裁爱上我',
      'script' as WorkType,
      '🎬',
      '现代都市爱情短剧，讲述职场新人与霸道总裁的爱情故事'
    );
    console.log('✅ 创建作品:', script1.title);

    // 第1集：重逢
    await createChapter(
      script1.id,
      '第1集：重逢',
      `<div class="mb-4 font-mono text-sm font-bold text-primary-700">
  第1场. 总裁办公室 - 日 - 内
</div>
<div class="mb-4 text-[#5d554a] leading-relaxed">
  阳光透过百叶窗洒在冰冷的黑胡桃木桌面上。顾川（28岁，冷峻）正在批阅文件。
</div>
<div class="mb-2 font-semibold text-[#38342e] text-center">顾川</div>
<div class="mb-4 text-[#38342e] text-center italic">这就是你们给出的方案？</div>
<div class="mb-4 text-[#5d554a] leading-relaxed">
  敲门声响起。苏浅（24岁，职场新人）推门而入，神色紧张。
</div>
<div class="mb-2 font-semibold text-[#38342e] text-center">苏浅</div>
<div class="mb-4 text-[#38342e] text-center italic">
  顾总，财务部那边催得紧...
</div>
<div class="mb-2 font-semibold text-[#38342e] text-center">顾川</div>
<div class="mb-4 text-[#38342e] text-center italic">
  （抬起头，目光锐利）出去。
</div>`,
      1
    );

    // 第2集：冲突
    await createChapter(
      script1.id,
      '第2集：冲突',
      `<div class="mb-4 font-mono text-sm font-bold text-primary-700">
  第2场. 会议室 - 日 - 内
</div>
<div class="mb-4 text-[#5d554a] leading-relaxed">
  项目会议正在进行。苏浅站在投影幕前，汇报市场调研数据。
</div>
<div class="mb-2 font-semibold text-[#38342e] text-center">苏浅</div>
<div class="mb-4 text-[#38342e] text-center italic">
  根据我们的调查，目标客户群体更倾向于...
</div>
<div class="mb-4 text-[#5d554a] leading-relaxed">
  顾川坐在主位，突然打断。
</div>
<div class="mb-2 font-semibold text-[#38342e] text-center">顾川</div>
<div class="mb-4 text-[#38342e] text-center italic">
  数据来源？样本量多少？
</div>`,
      2
    );

    // 第3集：真相
    await createChapter(
      script1.id,
      '第3集：真相',
      `<div class="mb-4 font-mono text-sm font-bold text-primary-700">
  第3场. 停车场 - 夜 - 外
</div>
<div class="mb-4 text-[#5d554a] leading-relaxed">
  雨后的停车场，昏黄的路灯下，苏浅拖着疲惫的身体走向公交站。
  一辆黑色玛莎拉蒂缓缓停在她身旁。
</div>
<div class="mb-2 font-semibold text-[#38342e] text-center">顾川</div>
<div class="mb-4 text-[#38342e] text-center italic">
  （摇下车窗）上车。
</div>
<div class="mb-2 font-semibold text-[#38342e] text-center">苏浅</div>
<div class="mb-4 text-[#38342e] text-center italic">
  （警惕）不用了，顾总。
</div>`,
      3
    );

    console.log(`✅ 创建了 3 个章节`);

    // ========== 小说1: 末日便利店 ==========
    const novel1 = await createWork(
      '末日便利店',
      'novel' as WorkType,
      '📚',
      '末日题材科幻小说，讲述一个普通便利店店员在末日中的生存故事'
    );
    console.log('✅ 创建作品:', novel1.title);

    // 第1章：灾难来临
    await createChapter(
      novel1.id,
      '第1章：灾难来临',
      `<p class="mb-4 text-[#38342e] leading-relaxed indent-8">
  2045年7月15日，晚上11点。
</p>
<p class="mb-4 text-[#38342e] leading-relaxed indent-8">
  林宇打了个哈欠，看着便利店外空荡荡的街道。夜班的第五个小时，
  整个城市仿佛都睡着了。他拿起手机，刷着无聊的短视频，
  突然，屏幕上弹出一条紧急新闻推送。
</p>
<p class="mb-4 text-[#38342e] leading-relaxed indent-8">
  "未知病毒全球爆发，请所有市民立即回家，关闭门窗..."
</p>
<p class="mb-4 text-[#38342e] leading-relaxed indent-8">
  林宇愣了一下，以为是某个恶作剧。直到店外传来一阵尖叫声，
  一个浑身是血的人影跌跌撞撞地冲进便利店。
</p>`,
      1
    );

    // 第2章：囤积物资
    await createChapter(
      novel1.id,
      '第2章：囤积物资',
      `<p class="mb-4 text-[#38342e] leading-relaxed indent-8">
  林宇迅速锁上了便利店的玻璃门。外面的街道上，越来越多的人在奔跑，
  尖叫声此起彼伏。他透过玻璃看到，那些人的眼睛泛着诡异的红光。
</p>
<p class="mb-4 text-[#38342e] leading-relaxed indent-8">
  "冷静，林宇，冷静..."他深吸一口气，开始在脑海中盘点便利店的物资。
  食物、水、药品、电池...这些都是末日中最宝贵的资源。
</p>
<p class="mb-4 text-[#38342e] leading-relaxed indent-8">
  作为一个资深的末日题材游戏玩家，林宇很清楚接下来要做什么。
  他开始将货架上的物资搬到仓库，准备长期坚守。
</p>`,
      2
    );

    // 第3章：第一个客人
    await createChapter(
      novel1.id,
      '第3章：第一个客人',
      `<p class="mb-4 text-[#38342e] leading-relaxed indent-8">
  三天后。
</p>
<p class="mb-4 text-[#38342e] leading-relaxed indent-8">
  林宇靠着窗户边缘，小心翼翼地观察着外面的情况。街道上到处是残骸，
  偶尔有几个感染者游荡而过。他已经三天没有见到正常人了。
</p>
<p class="mb-4 text-[#38342e] leading-relaxed indent-8">
  突然，一个穿着校服的女孩出现在街角。她的脸色苍白，步履蹒跚，
  但眼神清澈——是个幸存者！
</p>
<p class="mb-4 text-[#38342e] leading-relaxed indent-8">
  林宇犹豫了。打开门意味着风险，但见死不救...他咬了咬牙，
  快速打开了便利店的侧门。
</p>`,
      3
    );

    console.log(`✅ 创建了 3 个章节`);

    // ========== 短剧2: 重生之商业帝国 ==========
    const script2 = await createWork(
      '重生之商业帝国',
      'script' as WorkType,
      '🎬',
      '重生题材短剧，主角回到20年前，利用先知优势打造商业帝国'
    );
    console.log('✅ 创建作品:', script2.title);

    // 第1集：重回过去
    await createChapter(
      script2.id,
      '第1集：重回过去',
      `<div class="mb-4 font-mono text-sm font-bold text-primary-700">
  第1场. 医院病房 - 日 - 内
</div>
<div class="mb-4 text-[#5d554a] leading-relaxed">
  白色的天花板，消毒水的味道。张远（45岁）躺在病床上，
  生命监测仪发出微弱的嘀嘀声。
</div>
<div class="mb-2 font-semibold text-[#38342e] text-center">张远</div>
<div class="mb-4 text-[#38342e] text-center italic">
  （虚弱）如果...能重来一次...
</div>
<div class="mb-4 text-[#5d554a] leading-relaxed">
  监测仪的声音变成了一声长鸣。画面陷入黑暗。
</div>
<div class="mb-4 text-[#5d554a] leading-relaxed">
  [场景切换]
</div>
<div class="mb-4 font-mono text-sm font-bold text-primary-700">
  第2场. 大学宿舍 - 日 - 内
</div>
<div class="mb-4 text-[#5d554a] leading-relaxed">
  张远猛地睁开眼睛。周围是熟悉又陌生的景象——大学宿舍。
  日历显示：2005年9月1日。
</div>`,
      1
    );

    console.log('✅ 测试数据创建完成！');
    console.log('📊 统计: 3个作品，7个章节');

  } catch (error) {
    console.error('❌ 创建测试数据失败:', error);
    throw error;
  }
}

/**
 * 清空所有测试数据
 * 谨慎使用！
 */
export async function clearAllData(): Promise<void> {
  console.log('🗑️ 清空数据功能暂未实现');
  // TODO: 实现清空所有数据的功能
}
