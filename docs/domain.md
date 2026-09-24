# 领域约定

为融合新闻教学案例、来源证据和课程采用关系定义版本化契约，隔离教学视图与治理证据。

聚合对象包括`source_incident`、`teaching_case`、`course_adoption`、`rights_review`。事件类型包括`SOURCE_VERIFIED`、`CASE_REVIEWED`、`COURSE_FROZEN`、`ACCESS_REVOKED`、`FOLLOWUP_ISSUED`。所有时间都必须携带时区，版本号从 1 开始递增，校验层不会替调用方改写输入。

## 事件载荷

- `CASE_REVIEWED`：还需包含 `fact_review_id`, `rights_review_id`。
- `COURSE_FROZEN`：还需包含 `term_id`, `case_versions`。
- `ACCESS_REVOKED`：还需包含 `scope`, `effective_at`。

同一事件标识的幂等与冲突处理属于上层业务服务职责；交换层只负责稳定报告结构、枚举、时间、版本和必需载荷问题。
