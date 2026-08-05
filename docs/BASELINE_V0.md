# V0 Smoke 基线

日期：2026-08-05。范围：本地 Langfuse、自建 Dataset、两个独立 Skill / Agent 的单样本
Smoke。该结果只证明评测链路有效，不足以证明泛化质量。

## 有效运行

| 对象 | Run ID | Langfuse Experiment ID | Overall | 契约 |
|---|---|---|---:|---|
| Planner | `run-20260805T125924Z-31lonm` | `148b391d99e565fd` | 0.974624 | 通过 |
| Auditor | `run-20260805T130149Z-fhvpsu` | `5044bb3f3e5539cb` | 1.000000 | 通过 |

两个运行均为新临时工作区、新 `codex exec --ephemeral` 进程、只读沙箱。报告中的分数已与
Langfuse v4 Observations v2 和 Scores v3 API 逐项比对一致。

## 发现

Planner 唯一低于 1 的指标是 `observable_acceptance=0.517857`。人工检查发现，多条验收标准
实际具有可观察性，但当前正则评分器未识别“每个……均……”等表达。因此该结果首先归为
`Evaluator` 的候选误判，不能据此直接修改 Skill。

Auditor 的完整证据样本全部硬门禁通过。这只是最容易的正向样本；缺证、矛盾、陈旧证据、
正确阻塞和注入样本仍需在 dev / regression 中验证。

## 下一最小实验

1. 为可观察验收评分器增加正例和反例单元测试，再调整启发式规则。
2. 冻结 V0 Skill / Agent，运行两类各 6 个 dev 样本。
3. 按根因归类失败；先修 Dataset / Evaluator，再决定是否修改 Skill 或 Agent。
4. 每个确认缺陷加入 regression；通过 smoke→dev→regression 后才创建 holdout。

首个因输出 Schema 不兼容而失败的运行 `run-20260805T125845Z-708lz7` 保留为 Harness
故障样本，不纳入能力基线。Runner 已在 Harness 失败时跳过语义评分并将 overall 记为 0。
