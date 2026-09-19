# 浏览器下载上传完整往返验收

日期：2026-09-19。结论：Google Chrome 实际文件下载、原生文件选择器上传、导入、刷新、再次下载与恢复通过。

## 操作与证据

1. 在 Chrome 打开本地页面，初始为 5 题、4 模型、20 回答、0 评审。
2. 通过文件选择器导入 proposed-dataset.json（20 条 AI 建议评分，均为评审中），完整替换前生成备份。
3. 点击“导出当前 JSON”，文件实际落盘到 Downloads/arena-1789829143682.json。
4. 使用 macOS 原生文件选择器选择这份下载文件，页面预览识别 20 条评审；确认后自动创建第二份备份并导入。
5. 刷新页面再次导出，文件实际落盘到 Downloads/arena-1789829180116.json。
6. 逐项对比前后文件：models、cases、answers、reviews、scoring、scoring_history 完全相同，原有审计前缀完全保留；仅 updated_at 和新增的一条 import 审计发生预期变化。
7. 选择初始 before-import 备份恢复，界面确认成功，生成第三份恢复前备份。Chrome 回到原始评测内容，临时验收标签页已关闭。

归档文件：roundtrip-before.json、roundtrip-after.json、roundtrip-result.json。前两份为浏览器下载原文件副本，result 包含各文件 SHA-256 和比对结论。

## 工具限制与实际处理

内置浏览器下载事件等待超时，Downloads 中未发现相应文件，未确认其下载成功。Chrome 下载成功，但扩展文件上传因文件 URL 权限未开启而失败，因此改用系统原生文件选择窗口完成上传，没有调整扩展权限。原内置浏览器数据未替换。

本次为 Agent 操作真实浏览器与系统窗口的端到端验收，不声称用户手工点击验收。草稿评分明确标注 AI 建议，正式完成人工评审数为 0。
