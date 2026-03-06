# 主题配色参考

## 深色主题

### Viewpoint 深色 (vsm-dark)
```
背景: #0F0F0F
面板: #1E1E1E
强调: #E91E8C (棱镜粉)
```

### 深度专注 (vsm-dark-plus)
```
背景: #0A0A0A
面板: #141414
强调: #E91E8C
```

### VS Code Dark (vscode-dark)
```
背景: #1E1E1E
面板: #252526
强调: #007ACC (VS Code 蓝)
```

### VS Code Dark+ (vscode-dark-plus)
```
背景: #1E1E1E
面板: #2D2D2D
强调: #3794FF
```

### NotebookLM (notebook)
```
背景: #0F0F0F
面板: #1E1E1E
强调: #8AB4F8 (Google 蓝)
```

## 浅色主题

### Viewpoint 浅色 (vsm-light)
```
背景: #FFFFFF
面板: #F5F5F5
强调: #E91E8C
```

### 柔和米白 (soft-cream) ✨
```
背景: #FAF9F6 (米白色)
面板: #FFFFFF
次级面板: #F5F3EF
强调: #E91E8C
文字主色: #2C2A27
文字次色: #6B6762
```
**设计理念**: 温暖舒适，适合长时间阅读

### 清新薄荷 (fresh-mint) ✨
```
背景: #F7FDFB (淡青色)
面板: #FFFFFF
次级面板: #F0FAF7
强调: #10B981 (翠绿色)
文字主色: #1A2E27
文字次色: #4A6B5E
边框: rgba(16,185,129,0.12)
```
**设计理念**: 清爽自然，护眼舒适

### 温暖沙色 (warm-sand) ✨
```
背景: #FDFBF7 (暖白色)
面板: #FFFFFF
次级面板: #F9F6F0
强调: #D97706 (琥珀色)
文字主色: #2D2416
文字次色: #6B5D45
边框: rgba(180,140,90,0.15)
```
**设计理念**: 温暖柔和，适合创作场景

## 色彩使用规范

### 背景色层级
1. `background`: 最底层背景
2. `panel`: 主要面板/卡片
3. `panelSecondary`: 次级面板/悬浮元素
4. `panelTertiary`: 高亮/选中状态

### 文字色层级
1. `textPrimary`: 标题、重要内容
2. `textSecondary`: 正文、描述
3. `textTertiary`: 占位符、禁用状态
4. `textInverse`: 深色背景上的浅色文字

### 边框色层级
1. `border`: 主要边框
2. `borderSubtle`: 次要边框、分隔线
3. `borderFocus`: 聚焦状态边框

### 状态色
- `success`: #10B981 (绿色)
- `warning`: #F59E0B (橙色)
- `error`: #EF4444 (红色)
- `info`: #06B6D4 (青色)

## 对比度要求

根据 WCAG 2.1 标准：

- **AA 级别**: 对比度至少 4.5:1 (正文)
- **AAA 级别**: 对比度至少 7:1 (正文)
- **大文字**: 对比度至少 3:1

所有主题都已确保符合 AA 级别标准。

## 添加新主题

在 `client/src/types/theme.ts` 中添加：

```typescript
{
  id: 'your-theme-id',
  name: '主题名称',
  nameEn: 'Theme Name',
  type: 'light' | 'dark',
  colors: {
    background: '#FFFFFF',
    panel: '#F5F5F5',
    // ... 其他颜色
  }
}
```

在 `client/src/app/globals.css` 中添加 CSS 变量：

```css
[data-theme="your-theme-id"] {
  --bg-primary: #FFFFFF;
  --bg-panel: #F5F5F5;
  /* ... 其他变量 */
}
```

