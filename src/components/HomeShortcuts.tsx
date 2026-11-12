/**
 * HomeShortcuts —— 首页「快捷入口 / 工具」两个控件区块（it.21 抽出）。
 *
 * 为什么单独成文件（两个原因，都不是为了好看）：
 * 1. 首页本体已经 1100 行，塞不下第二套卡片结构；
 * 2. `scripts/glass-guard.js` 的 R4「内容层玻璃」是**按文件**近似判定的
 *    （文件里出现 ScrollView/FlatList 且有玻璃 API 就算命中）。首页是滚动容器，
 *    而这两个区块是**控件层**入口按钮（不是滚动内容卡片），抽成独立文件后
 *    规则回到真实语义：滚动内容层不叠玻璃，控件层可以用玻璃。
 *
 * it.21 材质变化：卡片全部换成 `GlassSurface` 真玻璃，曲率取统一档
 * `GLASS_SHAPE.card`（大卡）/ `control`（小卡），与 dock 同一套引擎超椭圆圆角；
 * 模糊 / 高光 / 膜层跟随全局 store（实验页拖滑块，这里实时跟着变）。
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { FadeInView, ScalePressable } from './Motion';
import { GlassSurface } from './GlassSurface';
import { SectionHeader } from './SectionHeader';
import { useI18n } from '../i18n';
import { spacing, usePalette } from '../theme';
import { typography } from '../theme/typography';

/** 入口项（与 HomeScreen 的 NavItem 同构，只用到这里出现的字段）。 */
export interface ShortcutItem {
  title: string;
  desc: string;
  route: string;
  params?: any;
  icon: string;
}

export interface HomeQuickEntriesProps {
  quick: ShortcutItem[];
  onNavigate: (item: ShortcutItem) => void;
}

export interface HomeToolsProps {
  toolChips: ShortcutItem[];
  onNavigate: (item: ShortcutItem) => void;
}

/**
 * 快捷入口：首项 = 通栏 Hero 卡（主视觉），其余 = 等宽三列卡。
 * 层级靠「材质同款 + 尺寸/字号不同」表达，不靠加投影（玻璃语言里投影总是错的）。
 */
export function HomeQuickEntries({ quick, onNavigate }: HomeQuickEntriesProps) {
  const palette = usePalette();
  const { t } = useI18n();

  return (
    <>
        {/*
          it.20 快捷入口重排（用户 2026-11-09 21:45：hero 风格 + SwiftUI 规范）。
          结构：首项「直播」= 通栏 Hero 卡（主视觉，52 图标 + title3），其余 3 项 = 等宽
          三列卡（图标在上、标签在下）。相对旧的「一行挤 4 个胶囊」：
          - 层级：主入口获得视觉重量，次级入口退为同尺寸网格，一眼分得清主次
          - 尺寸：每张卡 ≥ 96pt 高（远超 44pt 最小触摸区），不再有 11sp 文字被挤断
          - 网格：16 外边距 / 10 卡间距 / 20-24 连续圆角，全部落在 8pt 网格上
        */}
        <View style={styles.sectionOuter}>
          <SectionHeader title={t('快捷入口')} />
          <FadeInView delay={60} duration={320} distance={10}>
            <ScalePressable
              onPress={() => onNavigate(quick[0])}
              pressedScale={0.98}
              accessibilityRole="button"
              accessibilityLabel={quick[0].title}
            >
              {/* it.21：换真玻璃（GlassSurface）——曲率取统一档 GLASS_SHAPE.card，
                  与 dock 同为引擎超椭圆圆角；模糊/高光跟随全局滑块。
                  旧版是「不透明 surface + elevation 投影」，与玻璃语言不统一。 */}
              <GlassSurface shape="card" padding={spacing.md} style={styles.heroSurface} contentStyle={styles.heroRow}>
                <View style={[styles.heroIcon, { backgroundColor: palette.tint }]}>
                  <MaterialCommunityIcons name={quick[0].icon} color={palette.onTint} size={26} />
                </View>
                <View style={styles.heroText}>
                  <Text style={[typography.title3, { color: palette.label }]} numberOfLines={1}>
                    {quick[0].title}
                  </Text>
                  <Text style={[typography.footnote, { color: palette.labelSecondary, marginTop: 2 }]} numberOfLines={1}>
                    {t('进入直播大厅')}
                  </Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" color={palette.tint} size={22} />
              </GlassSurface>
            </ScalePressable>
          </FadeInView>

          <View style={styles.quickGrid}>
            {quick.slice(1).map((item, index) => (
              <FadeInView
                key={item.title}
                delay={100 + index * 30}
                duration={280}
                distance={8}
                style={styles.quickCell}
              >
                <ScalePressable
                  onPress={() => onNavigate(item)}
                  pressedScale={0.95}
                  accessibilityRole="button"
                  accessibilityLabel={item.title}
                >
                  {/* it.21：三列卡同为真玻璃，曲率取 GLASS_SHAPE.control（16）——
                      比 Hero 卡低一档，形成「大卡 > 小卡」的层级，且仍在同一套圆角刻度上。 */}
                  <GlassSurface
                    shape="control"
                    padding={12}
                    style={styles.quickSurface}
                    contentStyle={styles.quickContent}
                  >
                    <View style={[styles.quickCardIcon, { backgroundColor: palette.tintSoft }]}>
                      <MaterialCommunityIcons name={item.icon} color={palette.tint} size={22} />
                    </View>
                    <Text
                      style={[typography.caption1, { color: palette.label, fontWeight: '600', marginTop: 8 }]}
                      numberOfLines={1}
                    >
                      {item.title}
                    </Text>
                  </GlassSurface>
                </ScalePressable>
              </FadeInView>
            ))}
          </View>
        </View>
    </>
  );
}

/**
 * 工具：卡片内 4 列图标网格。
 * ⚠️ 整块**一张**玻璃，不是 15 张 —— 每张玻璃都是一次采集 + 一次 GPU 模糊，
 * 一屏 15 张会把 GPU 拖死；观感由「一张材质 + 内部留白」承担。
 */
export function HomeTools({ toolChips, onNavigate }: HomeToolsProps) {
  const palette = usePalette();
  const { t } = useI18n();

  return (
    <>
        {/*
          it.20 工具区重排（SwiftUI inset grouped grid 语义）：
          旧版是「15 个标签横向无限滚动」，用户必须滑到底才知道有哪些功能，且没有分组感。
          新版改成卡片内的 4 列图标网格（icon 22 + 11sp 标签），一屏看完 15 项，点击区
          每格 ≈ 76×66pt（≥44pt HIG 下限）。卡片 16 外边距 / 22 圆角 / hairline 描边。
        */}
        <View style={styles.sectionOuter}>
          <SectionHeader title={t('工具')} />
          <FadeInView delay={190} duration={320}>
            {/* it.21：整块工具面板一张真玻璃（不是 15 块小玻璃 —— 一屏 15 次采集
                会把 GPU 拖死，这里用「一张玻璃 + 内部普通格子」，观感与性能兼顾）。 */}
            <GlassSurface shape="card" padding={4} contentStyle={styles.toolGrid}>
              {toolChips.map((item) => (
                <ScalePressable
                  key={item.title}
                  onPress={() => onNavigate(item)}
                  pressedScale={0.92}
                  accessibilityRole="button"
                  accessibilityLabel={item.title}
                  style={styles.toolCell}
                >
                  <View style={[styles.toolIcon, { backgroundColor: palette.tintSoft }]}>
                    <MaterialCommunityIcons name={item.icon} color={palette.tint} size={22} />
                  </View>
                  <Text style={[typography.caption2, { color: palette.label, marginTop: 6 }]} numberOfLines={1}>
                    {item.title}
                  </Text>
                </ScalePressable>
              ))}
            </GlassSurface>
          </FadeInView>
        </View>
    </>
  );
}

const styles = StyleSheet.create({
  sectionOuter: {
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  // —— it.21：卡片底交给 GlassSurface，这里只留几何与内容布局 ——
  heroSurface: { minHeight: 96 },
  heroRow: { flexDirection: 'row', alignItems: 'center' },
  heroIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroText: { flex: 1, marginLeft: 14, marginRight: 8, minWidth: 0 },
  quickGrid: { flexDirection: 'row', gap: 10, marginTop: 10 },
  quickCell: { flex: 1 },
  quickSurface: { minHeight: 88 },
  quickContent: { alignItems: 'center', justifyContent: 'center', minHeight: 64 },
  quickCardIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingVertical: 4 },
  toolCell: { width: '25%', alignItems: 'center', paddingVertical: 10 },
  toolIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default HomeQuickEntries;
