# 领域约定

为融合新闻教学案例、来源证据和课程采用关系定义版本化契约，隔离教学视图与治理证据。所有时间都必须携带时区，版本号从 1 开始递增，校验层不会替调用方改写输入。

## 版本化对象

`aggregate_type` 登记十四类对象，各自独立版本化。版本内容不可改写，只能追加新版本：

| 对象 | 含义 |
| --- | --- |
| `source_incident` | 原始事件 |
| `source_evidence` | 来源证据 |
| `rights_holder` | 权利人 |
| `deidentified_version` | 去标识版本 |
| `ethics_issue` | 伦理争点 |
| `regulation` | 适用法规 |
| `textbook_chapter` | 教材章节 |
| `course_objective` | 课程目标 |
| `classroom_material` | 课堂材料 |
| `access_scope` | 学生访问范围 |
| `teaching_case` | 教学案例（教学叙事） |
| `fact_review` | 事实核验 |
| `rights_review` | 权利审查 |
| `course_adoption` | 课程采用 |

任何对象的新版本（含首版）通过 `VERSION_PUBLISHED` 进入库中，载荷必须携带 `content_fingerprint`（`sha256:` 前缀加 64 位十六进制）。同一对象同一指纹的重传是幂等重放，不得产生新版本；引用内容发生变化时必须以新指纹发布新版本。指纹去重与版本单调性由上层服务保证，交换层强制指纹格式与正整数版本。

## 角色与职责分离

`actor_role` 为必填信封字段，登记六种角色：`case_editor`（案例编辑）、`fact_checker`（事实核验）、`rights_reviewer`（权利审查）、`instructor`（教师）、`governance`（治理）、`system`（系统）。

案例编辑只能提出教学叙事（`NARRATIVE_PROPOSED`）；事实核验（`FACT_REVIEWED`）、权利审查（`RIGHTS_REVIEWED`）和课程采用（`COURSE_ADOPTED`）分别由对应角色完成。`actor_roles_by_event` 登记每个事件允许的角色，角色不匹配的事件在交换层即被拒绝（`role_not_allowed`）；`aggregate_types_by_event` 登记事件允许作用的对象类型，不匹配时报 `aggregate_mismatch`。

## 事件词汇

| 事件 | 作用对象 | 允许角色 | 必填载荷与取值约束 |
| --- | --- | --- | --- |
| `VERSION_PUBLISHED` | 任意版本化对象 | 不限 | `content_fingerprint`（sha256 指纹） |
| `SOURCE_VERIFIED` | `source_incident` | `fact_checker` | `content_fingerprint`（sha256 指纹） |
| `NARRATIVE_PROPOSED` | `teaching_case` | `case_editor` | `based_on`（叙事依据的对象版本引用） |
| `FACT_REVIEWED` | `fact_review` | `fact_checker` | `verdict` ∈ `approved` / `changes_requested` / `rejected` |
| `RIGHTS_REVIEWED` | `rights_review` | `rights_reviewer` | `verdict` 同上 |
| `CASE_REVIEWED` | `teaching_case` | `governance`, `system` | `fact_review_id`, `rights_review_id` |
| `COURSE_ADOPTED` | `course_adoption` | `instructor` | `course_id`, `term_id`, `case_version`（正整数） |
| `COURSE_FROZEN` | `course_adoption` | `instructor`, `system` | `term_id`, `case_versions`, `snapshot_id` |
| `ACCESS_SCOPED` | `access_scope` | `rights_reviewer`, `governance` | `scope` ∈ `minimal` / `classroom` / `course`，`export_allowed`（布尔），`citation_format` |
| `ACCESS_RESTRICTED` | `access_scope` | `rights_reviewer`, `governance`, `system` | `scope` 恒为 `minimal`，`reason_code`，`export_allowed` 恒为 `false`，`effective_at`（带时区） |
| `ACCESS_REVOKED` | `access_scope` | `rights_reviewer`, `governance`, `system` | `scope`，`effective_at`（带时区），`reason_code` |
| `RULING_RECORDED` | `regulation` | `governance`, `system` | `conclusion` |
| `CORRECTION_ISSUED` | `teaching_case`, `source_incident`, `classroom_material` | `case_editor`, `governance` | `corrects_version`（正整数） |
| `LICENSE_WITHDRAWN` | `rights_holder`, `source_evidence` | `rights_reviewer`, `governance`, `system` | `effective_at`（带时区） |
| `IMPACT_ASSESSED` | `course_adoption` | `system`, `governance` | `trigger_event_id`，`phase` ∈ `preparing` / `active` / `archived`，`action` |
| `FOLLOWUP_ISSUED` | `course_adoption` | `governance`, `system` | `basis_snapshot_id`，`action` |
| `REREVIEW_QUEUED` | `teaching_case` | `system`, `governance` | `dedupe_key`，`review_kind` ∈ `fact` / `rights` |
| `WITHDRAWAL_NOTIFIED` | `course_adoption` | `system`, `governance` | `dedupe_key` |

`reason_code` 取值：`ACCESS_RESTRICTED` 为 `minor_involved` / `unresolved_dispute` / `license_suspended` / `regulatory_flag`；`ACCESS_REVOKED` 为 `license_withdrawn` / `rights_holder_request` / `ruling_recorded` / `correction_issued` / `policy_change`。`action` 取值：`IMPACT_ASSESSED` 为 `none` / `notify_teacher` / `swap_case_version` / `restrict_access` / `revoke_access`；`FOLLOWUP_ISSUED` 另含 `archive_annotation`，不含 `none`。

## 关键不变量

### 采用即钉版，并发不改写共享事实

`COURSE_ADOPTED` 必须携带 `case_version`（正整数）。多个课程并发采用同一案例时只引用已发布版本；原始事件、证据、审查结论等共享事实对象不接受就地改写，变更只能以新版本追加。

### 学期冻结与治理追溯

开课时 `COURSE_FROZEN` 冻结案例包，载荷携带 `term_id`、`case_versions` 与 `snapshot_id`。快照是治理追溯的锚点：从 `snapshot_id` 到 `case_versions`，到 `CASE_REVIEWED` 的 `fact_review_id` / `rights_review_id`，再到 `SOURCE_VERIFIED` 的 `content_fingerprint`，以及该对象历次的 `ACCESS_RESTRICTED` / `ACCESS_REVOKED` 记录，治理人员可以完整还原任何一门课程当时所依据的证据、审查与限制。

### 最小范围与导出限制

涉及未成年人或未结争议的材料通过 `ACCESS_RESTRICTED` 限制，其 `scope` 恒为 `minimal`、`export_allowed` 恒为 `false`。`ACCESS_SCOPED` 在 `scope` 为 `minimal` 时同样必须 `export_allowed=false`，违反时报 `implication_violated`。教师端任何导出都必须按冻结快照中的访问范围执行，不得借导出绕过限制。

### 学生视图与不可用原因

学生只能看到经批准（`CASE_REVIEWED` 完成）且已设定访问范围（`ACCESS_SCOPED`）的材料，以及 `citation_format` 指定的引用方式。`ACCESS_RESTRICTED` 与 `ACCESS_REVOKED` 必须携带 `reason_code`，教师端据此说明某项内容为何不可用。

### 变更影响分级

判决（`RULING_RECORDED`）、勘误（`CORRECTION_ISSUED`）与授权撤回（`LICENSE_WITHDRAWN`）触发 `IMPACT_ASSESSED`，按课程阶段 `preparing` / `active` / `archived` 分别给出 `action`：备课中课程可换版（`swap_case_version`），授课中课程限制或撤销访问并通知教师，已归档课程只追加处置记录，不改写历史快照。

### 当时依据与后续处置

`FOLLOWUP_ISSUED` 必须引用 `basis_snapshot_id`：已发生的教学记录保留当时依据，后续处置以冻结快照为基准追加，而不是回溯修改。

### 故障恢复与通知去重

`REREVIEW_QUEUED` 与 `WITHDRAWAL_NOTIFIED` 必须携带 `dedupe_key`。故障恢复重放时，上层按 `dedupe_key` 去重，保证待重审与撤回通知不漏发、不重复；事件日志的持久化与投递确认属上层职责。

## 边界

同一事件标识的幂等与冲突处理属于上层业务服务职责；交换层只负责稳定报告结构、枚举、时间、版本、角色和必需载荷问题。信封不接受未登记字段（`unsupported_field`）。
