# 领域约定

为融合新闻教学案例、来源证据和课程采用关系定义版本化契约，隔离教学视图与治理证据。

所有时间都必须携带时区（载荷中以 `_at` 结尾的字段同样按时间处理），版本号从 1 开始递增，校验层不会替调用方改写输入。

## 聚合对象

原始事件、来源证据、权利人、去标识版本、伦理争点、适用法规、教材章节、课程目标、课堂材料与学生访问范围分别版本化；教学案例、核验与审查记录、课程采用关系、后续处置和通知同样是独立聚合，各自维护从 1 递增的版本链。

| aggregate_type | 含义 |
| --- | --- |
| `source_incident` | 原始事件（深度伪造、算法黑箱、移动直播等） |
| `source_evidence` | 来源证据，按内容指纹幂等 |
| `rights_holder` | 权利人（媒体机构、当事人等） |
| `deidentified_version` | 去标识版本 |
| `ethical_issue` | 伦理争点 |
| `applicable_regulation` | 适用法规 |
| `textbook_chapter` | 教材章节（随版次发布） |
| `course_objective` | 课程目标 |
| `classroom_material` | 课堂材料 |
| `access_scope` | 学生访问范围 |
| `teaching_case` | 教学案例（教学叙事） |
| `fact_review` | 事实核验记录 |
| `rights_review` | 权利审查记录 |
| `course_adoption` | 课程采用关系 |
| `followup_disposition` | 后续处置 |
| `notification` | 通知（待重审、撤回、处置） |

## 角色与职责分离

案例编辑提出教学叙事（`CASE_PROPOSED`）；事实核验（`FACT_REVIEW_COMPLETED`）、权利审查（`RIGHTS_REVIEW_COMPLETED`）与课程采用（`COURSE_ADOPTED`）分别由不同角色完成。合约以独立聚合与事件体现分工：核验、审查、采用各有自己的聚合与版本链，任何一方都不能改写他方记录。同一人是否兼任、核验是否先于审查等身份与顺序约束由上层业务服务校验，交换层不判断。

## 事件目录

### 来源与证据

| event_type | aggregate_type | 必需载荷 | 枚举约束 |
| --- | --- | --- | --- |
| `INCIDENT_REGISTERED` | `source_incident` | `title`, `category` | `category`: `deepfake` / `algorithm_black_box` / `mobile_livestream` / `other` |
| `SOURCE_SUBMITTED` | `source_evidence` | `incident_id`, `content_fingerprint` | — |
| `SOURCE_DEDUPLICATED` | `source_incident` | `content_fingerprint`, `existing_evidence_id` | — |
| `EVIDENCE_VERSIONED` | `source_evidence` | `content_fingerprint`, `supersedes_version` | — |
| `SOURCE_VERIFIED` | `source_incident` | `fact_review_id` | — |

### 核验、审查与去标识

| event_type | aggregate_type | 必需载荷 | 枚举约束 |
| --- | --- | --- | --- |
| `FACT_REVIEW_COMPLETED` | `fact_review` | `reviewer_id`, `verdict` | `verdict`: `confirmed` / `partially_confirmed` / `refuted` / `unverifiable` |
| `RIGHTS_REVIEW_COMPLETED` | `rights_review` | `reviewer_id`, `decision` | `decision`: `granted` / `granted_with_limits` / `denied` |
| `DEIDENTIFICATION_PUBLISHED` | `deidentified_version` | `source_evidence_id`, `anonymization_level` | `anonymization_level`: `partial` / `full` |

### 案例与课程内容

| event_type | aggregate_type | 必需载荷 | 枚举约束 |
| --- | --- | --- | --- |
| `ETHICAL_ISSUE_RECORDED` | `ethical_issue` | `summary` | — |
| `REGULATION_UPDATED` | `applicable_regulation` | `regulation_ref`, `effective_at` | — |
| `CHAPTER_RELEASED` | `textbook_chapter` | `textbook_id`, `edition` | — |
| `OBJECTIVE_DEFINED` | `course_objective` | `course_id`, `summary` | — |
| `CASE_PROPOSED` | `teaching_case` | `editor_id`, `chapter_id` | — |
| `CASE_REVIEWED` | `teaching_case` | `fact_review_id`, `rights_review_id`, `decision` | `decision`: `approved` / `approved_with_restrictions` / `rejected` |
| `MATERIAL_PUBLISHED` | `classroom_material` | `case_id`, `access_scope_id`, `citation_format` | — |

### 访问控制

| event_type | aggregate_type | 必需载荷 | 枚举约束 |
| --- | --- | --- | --- |
| `ACCESS_SCOPED` | `access_scope` | `material_id`, `audience` | `audience`: `public` / `enrolled_students` / `instructors_only` / `minimal` |
| `RESTRICTION_IMPOSED` | `access_scope` | `material_id`, `reason`, `scope`, `effective_at` | `reason`: `minor_involved` / `pending_dispute` / `license_limit` / `regulatory_order`；`scope`: `minimal` / `instructors_only` |
| `EXPORT_DENIED` | `classroom_material` | `requested_by`, `reason` | `reason`: 同 `RESTRICTION_IMPOSED`，另含 `scope_exceeded` |
| `ACCESS_REVOKED` | `access_scope` | `scope`, `effective_at` | `scope`: `public` / `enrolled_students` / `instructors_only` / `all` |

### 采用与冻结

| event_type | aggregate_type | 必需载荷 | 枚举约束 |
| --- | --- | --- | --- |
| `COURSE_ADOPTED` | `course_adoption` | `course_id`, `case_id`, `case_version` | — |
| `COURSE_FROZEN` | `course_adoption` | `term_id`, `case_versions` | — |

### 事后变化与影响

| event_type | aggregate_type | 必需载荷 | 枚举约束 |
| --- | --- | --- | --- |
| `RULING_RECORDED` | `source_incident` | `ruling_ref`, `effective_at` | — |
| `CORRECTION_ISSUED` | `teaching_case` | `reason`, `effective_at` | — |
| `LICENSE_WITHDRAWN` | `rights_holder` | `license_ref`, `effective_at` | — |
| `IMPACT_ASSESSED` | `course_adoption` | `cause_event_id`, `phase`, `action` | `phase`: `preparing` / `in_session` / `archived`；`action`: `none` / `notify` / `re_review` / `suspend_material` / `annotate_record` |
| `FOLLOWUP_ISSUED` | `followup_disposition` | `course_id`, `disposition`, `basis_version` | `disposition`: `record_annotated` / `material_replaced` / `student_notified` / `case_retired` |

### 通知

| event_type | aggregate_type | 必需载荷 | 枚举约束 |
| --- | --- | --- | --- |
| `NOTIFICATION_DISPATCHED` | `notification` | `notification_id`, `dedup_key`, `kind`, `caused_by_event_id` | `kind`: `re_review_request` / `withdrawal_notice` / `followup_notice` |

## 关键规则

### 版本与幂等

- 相同来源重传依 `content_fingerprint` 幂等：指纹命中已有证据时记录 `SOURCE_DEDUPLICATED`，不新建证据、不推进证据版本。
- 引用内容变化必须新建版本：记录 `EVIDENCE_VERSIONED`，`supersedes_version` 指向前一版本，历史版本不改写。
- 多门课程并发采用同一案例时，每个 `course_adoption` 是独立聚合，只引用教学案例的版本号，不得改写共享事实。

### 学期冻结与影响计算

- 每学期开课时以 `COURSE_FROZEN` 冻结案例包，`case_versions` 记录当时采用的案例版本快照。
- 冻结之后的判决（`RULING_RECORDED`）、勘误（`CORRECTION_ISSUED`）与授权撤回（`LICENSE_WITHDRAWN`）通过 `IMPACT_ASSESSED` 按课程阶段分别计算影响：`preparing`（备课中）、`in_session`（授课中）、`archived`（已归档），每个受影响的采用关系各记一条。
- 已发生的教学记录保留当时依据：`FOLLOWUP_ISSUED.basis_version` 指向冻结时的案例版本，处置方式见 `disposition` 枚举。

### 最小范围与导出

- 涉及未成年人（`minor_involved`）或未结争议（`pending_dispute`）的材料只能以 `minimal` 范围使用，通过 `RESTRICTION_IMPOSED` 记录并生效。
- 教师不得以导出绕过限制：导出尝试被拒绝时记录 `EXPORT_DENIED`，`reason` 为机器可读的原因码。

### 教学视图

- 学生只能看到经 `MATERIAL_PUBLISHED` 发布的材料与 `citation_format` 指定的引用方式；材料发布前必须存在获准的 `CASE_REVIEWED`（先后顺序由上层服务保证）。
- 教师查询某项内容为何不可用时，依据 `RESTRICTION_IMPOSED.reason`、`EXPORT_DENIED.reason` 与 `ACCESS_REVOKED` 的机器可读原因码作答。

### 通知与故障恢复

- 待重审与撤回通知以 `NOTIFICATION_DISPATCHED` 记录，`dedup_key` 全局唯一，`caused_by_event_id` 指向触发通知的原因事件。
- 故障恢复后按原因事件重扫补发：同一 `dedup_key` 重复投递必须被去重，不得漏发也不得重复。

### 追溯路径

治理人员可从课程快照一路追到证据、审查和历次限制：

`COURSE_FROZEN.case_versions` → `CASE_REVIEWED`（`fact_review_id`、`rights_review_id`）→ 核验与审查记录 → `SOURCE_SUBMITTED` / `EVIDENCE_VERSIONED` / `DEIDENTIFICATION_PUBLISHED` → `RESTRICTION_IMPOSED` / `ACCESS_REVOKED`。

## 校验边界

同一事件标识的幂等与冲突处理、指纹是否已存在、版本是否连续、角色是否互斥、事件先后顺序等属于上层业务服务职责；交换层只负责稳定报告结构、枚举、时间、版本、事件与聚合的匹配和必需载荷问题。
