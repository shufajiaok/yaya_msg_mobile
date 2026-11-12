/**
 * SectionHeader —— 首页 / 通用区块标题（it.21 抽出复用）。
 *
 * 原本是 HomeScreen 里的私有组件；it.21 把「快捷入口 / 工具」抽成独立组件
 * （`HomeShortcuts`，避免首页 1100 行、也避免内容层玻璃规则误判）后，
 * 两处都需要它，故提到 components 层，实现逐字保持不变。
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { ScalePressable } from './Motion';
import { usePalette } from '../theme';
import { typography } from '../theme/typography';

export interface SectionHeaderProps {
  title: string;
  action_label?: string;
  onAction?: () => void;
}

export function SectionHeader({ title, action_label, onAction }: SectionHeaderProps) {
  const palette = usePalette();
  return (
    <View style={styles.sectionHead}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={[styles.sectionDot, { backgroundColor: palette.tint }]} />
        <Text style={[typography.headline, { color: palette.label, marginLeft: 8 }]}>{title}</Text>
      </View>
      {action_label && onAction ? (
        <ScalePressable onPress={onAction} pressedScale={0.94}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={[typography.footnote, { color: palette.tint, fontWeight: '700' }]}>{action_label}</Text>
            <MaterialCommunityIcons name="chevron-right" color={palette.tint} size={16} />
          </View>
        </ScalePressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sectionDot: { width: 4, height: 18, borderRadius: 2 },
});

export default SectionHeader;
