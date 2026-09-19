# 第二模块：本地存储与状态管理

## 调用入口

```ts
import { Repository } from '../src/store/storage.js';
import { EvaluationStore } from '../src/store/evaluationStore.js';

const store = new EvaluationStore(new Repository(window.localStorage));
const state = store.getState();
const unsubscribe = store.subscribe(() => {
  // 重新读取 store.getState() 更新界面。
});
```

当前为框架无关的状态服务，尚未接入 React 页面。接口包括 `getState`、`subscribe`、`saveReview`、`editAnswer`、`updateScoring`、`backup`、`listBackups`、`importDataset` 和 `restoreBackup`。

## 保存和恢复

- 当前状态保存在 `financial-agent-arena:v1`。首次无数据时加载种子，首次业务修改时保存。
- 业务变更和审计事件构造在独立副本中，校验后一起写入；写入成功才发布新状态和通知订阅者。
- 无变化的评审、回答和评分规则保存不产生审计事件。
- 读取损坏数据或不支持版本时提供只读种子和 `warning`，保留原文并禁止写入。`Repository.rawCurrent()` 可供未来页面提供原文下载。
- 检测到磁盘数据与加载时不一致时拒绝写入，要求重载，减少多页面覆盖。此检查不是跨页面事务锁，不保证多个标签同时写入的严格并发安全；当前定位单用户单活动页面。

## 评审及回答版本

`saveReview` 只处理当前有效回答，根据回答版本新增或修改一条记录，保存原始分数、标签、评语及状态；自动维护创建、更新和完成时间。已完成记录缺少当前维度时拒绝保存；部分评分可作为评审中保存。

`editAnswer` 新增回答版本，旧版 `is_current` 设为 false。旧回答及评分保留，新版本不复制评审。`updateScoring` 保存旧规则版本，旧评审继续绑定原规则。当前排名及待补评提示由后续统计模块处理，本模块不计算排名。

## 多次备份

备份独立保存于 `financial-agent-arena:backup:v1:<backup_id>`，包含时间、原因、计算规则版本、SHA-256 摘要和完整数据；不包含其他备份或连接密钥。需要支持 Web Crypto 的环境（本地页面应通过 localhost 访问）。

- `backup()` 手动创建；备份 ID 重复时拒绝覆盖。
- `listBackups()` 返回通过验证的备份和损坏备份错误列表，不静默忽略损坏项。
- `restoreBackup(id)` 校验摘要和关联关系，备份当前状态后恢复选定快照，追加恢复事件，保留原有备份。
- `importDataset(input)` 校验数据后备份当前状态，整体替换，并记录导入事件；这是服务接口，文件选择和确认界面尚未实现。
- 异步备份、导入或恢复期间禁止其他状态修改，防止同一 Store 内快照与业务变化交错。
- 备份失败时不替换当前状态；替换写入失败时保留旧状态和刚生成的备份。
- 不自动删除备份。浏览器清理网站数据仍会清除所有本地记录，最终交付需要文件归档。

## 已知边界

未实现模型管理操作、密钥存储、软删除交互、文件导入导出界面、全部备份归档、历史页面、统计和报告。SHA-256 用于发现内容变化，不保证身份或防篡改。

本模块测试使用独立内存适配器模拟浏览器 Storage、空间不足和损坏数据。尚未进行实际浏览器刷新验收，待页面实现后执行。
