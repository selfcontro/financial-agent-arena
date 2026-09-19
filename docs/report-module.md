# 第八模块：程序生成对比报告

## 内容与保存

`src/services/report.ts` 使用统一统计函数，输出规则权重、模型排行榜、维度平均分、失败标签数量与比例，以及每题的参考结论、关键数字、证据、回答和引用、人工分数、标签与评语。模型数量动态变化，默认种子数据产生四模型报告。

JSON 报告包含 report_version、calculation_version、generated_at、dataset_hash、dataset、summary 和 markdown。dataset 为校验后的深拷贝，包含历史版本、历史规则和审计；生成后不再读取页面状态。摘要只覆盖规范化数据集，不包含报告生成时间。

浏览器汇总页可预览并下载 Markdown 报告、JSON 报告及单独数据快照。JSON 报告不是数据集格式；恢复时导入单独数据快照。报告下载由浏览器负责，未在本地存储中自动累积报告。

CLI：

```sh
npm run report
npm run report -- path/to/dataset.json reports/my-run
npm run report -- --verify reports/report.json
```

默认生成 reports/report.md 与 reports/report.json。固定输入及生成时间产生相同内容。verify 使用内嵌数据、相同生成时间重新生成，对比摘要、汇总及 Markdown。算法变更时必须提升 calculation_version 并保留对应复算逻辑；当前只支持版本 1。摘要不是数字签名，不证明评分来源真实性。

## 实际交付及限制

仓库生成报告有 5 道题、4 个模型和 20 条回答，人工评审为空。没有伪造评分或排名；报告明确标注未评分状态。最终有排名的报告仍需要用户完成正式人工评分后生成。报告生成不调用模型，也不应用页面筛选条件。全部数据原始历史位于 JSON 快照中，Markdown 以当前回答的逐题对比为主。

## 验证

新增 3 个测试覆盖默认四模型报告、固定输入复现、快照隔离、摘要及结果篡改检测、已保存分数和表格转义。累计 63 个测试通过。CLI 实际生成两个文件，并运行 verify 成功。浏览器预览显示已有测试数据的 1/25 完成与 67.00 分，包含对应测试评语；测试评分没有写入仓库报告。浏览器下载文件落盘尚未单独验收，CLI 输出已核实。
