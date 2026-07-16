# AI Collaboration Insights

AI Collaboration Insights (`aci`) 是一个本地优先的 Codex 协作日报生成器。它只读扫描本机 Codex session 日志，每天生成一份自包含 HTML，依次呈现使用数据与 L1-L4、工作成果、教练建议。

`v0.2.2` 是公开 alpha 补丁版：仅支持 Codex 和日报，不包含 Claude Code、多工具、周/月报、常驻服务、动态 Dashboard 或云端上传。

## 安装

支持 macOS Apple Silicon 和 Intel。安装器下载固定 `v0.2.2` asset，验证 SHA-256，安装到 `~/.local/bin/aci`，并配置当前用户的 19:00 LaunchAgent；全程不使用 `sudo`。

```sh
curl -fsSL https://github.com/PANGKAIFENG/ai-collaboration-insights/releases/download/v0.2.2/install.sh | sh
```

二进制尚未使用 Apple Developer ID 签名或公证，macOS 首次运行可能要求用户确认。

## 使用

```sh
aci doctor
aci report --no-ai --open
aci report --date 2026-07-15 --no-ai --open
aci consent grant
aci consent status
aci schedule status
```

默认日报窗口是本地时区昨日 19:00 至今日 19:00，左闭右开。自动任务每天 19:00 运行，并在登录或恢复后补偿最近 7 个缺失窗口。重复输入保持幂等；源日志变化时生成新 revision。

Token 指标累加窗口内每次模型调用的 `last_token_usage`，并用同事件携带的
`total_token_usage` 累计快照去重；只有日志缺少调用增量时，才回退到会话累计峰值。
因此跨越日报边界的长会话不会把窗口外消耗计入当天，`tokensPerSession` 也使用同一口径。

未授权 AI 分析时，`aci` 仍生成确定性指标、工作区间、任务、证据评分和建议。授权后会将经过大小限制和脱敏的最小分析包发送给本机已登录的 `codex exec --ephemeral`；不会接收或保存 API Key。

## 本地数据与隐私

- Codex 源目录只读，不修改日志内容、权限或时间戳。
- 报告保存在 `~/Library/Application Support/ai-collaboration-insights/reports/`。
- HTML 不运行 JavaScript，不加载远程资源，不启动本地服务器。
- 产品没有 telemetry、远程上传、账号系统或常驻 daemon。
- `aci data purge` 只删除带 ownership marker 的应用派生目录，不触碰 `~/.codex` 或 Codex 登录态。

撤回 AI 分析授权：

```sh
aci consent revoke
```

## 卸载

默认卸载删除二进制和 LaunchAgent，但保留本地报告：

```sh
curl -fsSL https://github.com/PANGKAIFENG/ai-collaboration-insights/releases/download/v0.2.2/uninstall.sh | sh
```

显式删除全部应用派生数据：

```sh
curl -fsSL https://github.com/PANGKAIFENG/ai-collaboration-insights/releases/download/v0.2.2/uninstall.sh | sh -s -- --purge-data
```

## 开发

需要 Deno `2.7.1` 和 Python 3：

```sh
deno task verify
python3 -m unittest tests/eval/test_scoring_baseline.py -v
python3 scripts/eval_scoring_baseline.py \
  --rubric tests/eval/scoring-baseline/rubric.v1.json \
  --cases tests/eval/scoring-baseline/cases.v1.jsonl \
  --predictions tests/eval/scoring-baseline/predictions.conformance.jsonl
python3 -m unittest tests/eval/test_progressive_analysis.py -v
python3 scripts/eval_progressive_analysis.py \
  --gold tests/eval/progressive-analysis/gold.synthetic.v1.jsonl \
  --predictions tests/eval/progressive-analysis/predictions.conformance.v1.jsonl \
  --share-safe
sh scripts/privacy_check.sh
```

产品范围、架构和实施计划：

- [Codex 日报 MVP 范围](docs/PRD/codex-daily-report-mvp-scope-v0.1.md)
- [渐进分析 PRD](docs/PRD/ai-collaboration-review-prd-v0.3.md)
- [运行时 ADR](docs/DECISIONS/ADR-0001-codex-daily-report-runtime.md)
- [v0.2 实施计划](plans/codex-progressive-analysis-v0.2.md)
- [贡献指南](CONTRIBUTING.md)

## License

Apache-2.0，见 [LICENSE](LICENSE)。
