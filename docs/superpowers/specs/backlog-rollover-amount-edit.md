# Backlog: 在已有卡上编辑 rollover 金额

**Status:** Shipped — see [2026-04-16-rollover-amount-edit plan](../plans/2026-04-16-rollover-amount-edit.md) and [rollover module doc](../../dev/modules/rollover.md).

## Context

当前(2026-04-16)产品的 rollover 行为:

- **`BackfillDialog`(支持指定 rollover 金额)**:只在新建卡时由 `MainWindow.tsx:101` 自动触发,新卡创建后无入口可重新打开
- **BenefitCard 的 ↗ 按钮**:调用 `useCardStore.rolloverBenefit`,只能"标记当前 cycle 已 rollover",不接受金额参数,record 固定 `faceValue=0, actualValue=0`
- **`generateRolloverRecords`**:工具函数已支持按金额生成多条 past-period records,但只被 BackfillDialog 用

## 痛点

用户在已有卡上想调整某个 benefit 的 rollover 金额(例如修正首次填写的累计余额、或想 H1 期间预先把当前 cycle roll forward 但具体金额不是整 faceValue)无路可走。

## 候选方案

需要正式 brainstorming,大致几个方向:
1. **CardDetail 上加"Rollover 设置"入口** → 复用 BackfillDialog 组件,但只显示 rollover 部分
2. **BenefitCard ↗ 按钮改为弹 prompt** → 让用户输入金额,内部用 `generateRolloverRecords`
3. **独立 BenefitDetail 页** → 显示 rollover 累计、能编辑

## 数据模型相关问题

- 当前 isRollover record 的 `usedDate` 语义不一致:
  - `rolloverBenefit` 用 `today`(落在当前 cycle)
  - `generateRolloverRecords` 用 `prevRange.start`(落在过去 cycle)
- `findCycleRecord` 不区分 `isRollover`,导致当前 cycle 内的 isRollover record 被 UI 当作"已使用"
- 这两个分歧需要在重新设计 rollover 编辑功能时一并解决

## 不在范围内

- Template versioning(已通过 2026-04-16-template-versioning plan 处理)
- 已发生的数据迁移问题(2026-04-16 通过 `scripts/cleanup-duplicate-benefits.mjs` 一次性处理)
