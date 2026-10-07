import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { validateEvent } from "../src/contracts.js";

const schema = JSON.parse(await readFile(new URL("../contracts/domain.schema.json", import.meta.url), "utf8"));
const sample = JSON.parse(await readFile(new URL("../data/sample.json", import.meta.url), "utf8"));

const FINGERPRINT = "sha256:7f3a9c1e5b2d8f40a6e1c39b075d4f28a9c6e3b15d08f2a47c95e1b36d0a84c2";
const NOW = "2026-10-07T09:30:00+08:00";

function eventOf(eventType, aggregateType, actorRole, payload) {
  return {
    event_id: `evt-${eventType.toLowerCase()}`,
    event_type: eventType,
    aggregate_type: aggregateType,
    aggregate_id: "agg-001",
    occurred_at: NOW,
    version: 1,
    actor_role: actorRole,
    payload,
  };
}

const validEvents = [
  ["VERSION_PUBLISHED", "source_incident", "case_editor", { content_fingerprint: FINGERPRINT }],
  ["SOURCE_VERIFIED", "source_incident", "fact_checker", { content_fingerprint: FINGERPRINT }],
  ["NARRATIVE_PROPOSED", "teaching_case", "case_editor", { based_on: [{ aggregate_type: "source_incident", aggregate_id: "inc-001", version: 1 }] }],
  ["FACT_REVIEWED", "fact_review", "fact_checker", { verdict: "approved" }],
  ["RIGHTS_REVIEWED", "rights_review", "rights_reviewer", { verdict: "changes_requested" }],
  ["CASE_REVIEWED", "teaching_case", "governance", { fact_review_id: "fr-001", rights_review_id: "rr-001" }],
  ["COURSE_ADOPTED", "course_adoption", "instructor", { course_id: "course-001", term_id: "2026-autumn", case_version: 3 }],
  ["COURSE_FROZEN", "course_adoption", "system", { term_id: "2026-autumn", case_versions: [{ case_id: "tc-001", version: 3 }], snapshot_id: "snap-001" }],
  ["ACCESS_SCOPED", "access_scope", "rights_reviewer", { scope: "classroom", export_allowed: true, citation_format: "GB/T 7714-2015" }],
  ["ACCESS_RESTRICTED", "access_scope", "governance", { scope: "minimal", reason_code: "minor_involved", export_allowed: false, effective_at: NOW }],
  ["ACCESS_REVOKED", "access_scope", "rights_reviewer", { scope: "course", effective_at: NOW, reason_code: "license_withdrawn" }],
  ["RULING_RECORDED", "regulation", "governance", { conclusion: "监管部门认定涉事算法推荐构成不当引导" }],
  ["CORRECTION_ISSUED", "teaching_case", "case_editor", { corrects_version: 2 }],
  ["LICENSE_WITHDRAWN", "rights_holder", "rights_reviewer", { effective_at: NOW }],
  ["IMPACT_ASSESSED", "course_adoption", "system", { trigger_event_id: "evt-ruling", phase: "active", action: "restrict_access" }],
  ["FOLLOWUP_ISSUED", "course_adoption", "governance", { basis_snapshot_id: "snap-001", action: "notify_teacher" }],
  ["REREVIEW_QUEUED", "teaching_case", "system", { dedupe_key: "rereview:tc-001:fact:evt-ruling", review_kind: "fact" }],
  ["WITHDRAWAL_NOTIFIED", "course_adoption", "system", { dedupe_key: "withdraw:ca-001:evt-license" }],
];

test("中文样例通过校验", () => {
  assert.deepEqual(validateEvent(sample, schema), []);
});

test("样例覆盖契约登记的全部事件类型", () => {
  assert.deepEqual(
    validEvents.map(([eventType]) => eventType).toSorted(),
    schema.properties.event_type.enum.toSorted(),
  );
});

test("全部事件类型的合法样例都能通过", () => {
  for (const [eventType, aggregateType, actorRole, payload] of validEvents) {
    assert.deepEqual(validateEvent(eventOf(eventType, aggregateType, actorRole, payload), schema), [], eventType);
  }
});

test("缺少信封字段时按稳定顺序报告", () => {
  const issues = validateEvent({}, schema);
  assert.deepEqual(issues.map((item) => item.field), issues.map((item) => item.field).toSorted());
  assert.ok(issues.some((item) => item.field === "event_id"));
  assert.ok(issues.some((item) => item.field === "actor_role"));
});

test("时间必须带时区且版本必须为正整数", () => {
  const issues = validateEvent({ ...sample, occurred_at: "2026-09-24T12:00:00", version: 0 }, schema);
  assert.ok(issues.some((item) => item.field === "occurred_at" && item.code === "timezone_required"));
  assert.ok(issues.some((item) => item.field === "version" && item.code === "positive_integer"));
});

test("事件专属载荷不可缺失", () => {
  const issues = validateEvent(
    { ...sample, event_type: "CASE_REVIEWED", aggregate_type: "teaching_case", actor_role: "governance", payload: {} },
    schema,
  );
  assert.ok(issues.some((item) => item.field === "payload.fact_review_id" && item.code === "required"));
});

test("未知事件类型会被拒绝", () => {
  const issues = validateEvent({ ...sample, event_type: "UNKNOWN" }, schema);
  assert.ok(issues.some((item) => item.field === "event_type" && item.code === "unsupported_value"));
});

test("未登记的顶层字段会被拒绝", () => {
  const issues = validateEvent({ ...sample, debug: true }, schema);
  assert.ok(issues.some((item) => item.field === "debug" && item.code === "unsupported_field"));
});

test("角色与事件类型不匹配会被拒绝", () => {
  const issues = validateEvent(eventOf("NARRATIVE_PROPOSED", "teaching_case", "instructor", { based_on: [] }), schema);
  assert.ok(issues.some((item) => item.field === "actor_role" && item.code === "role_not_allowed"));
});

test("事件与对象类型不匹配会被拒绝", () => {
  const issues = validateEvent(
    eventOf("COURSE_FROZEN", "teaching_case", "system", { term_id: "2026-autumn", case_versions: [], snapshot_id: "snap-001" }),
    schema,
  );
  assert.ok(issues.some((item) => item.field === "aggregate_type" && item.code === "aggregate_mismatch"));
});

test("内容指纹必须符合契约格式", () => {
  const issues = validateEvent(
    eventOf("VERSION_PUBLISHED", "source_evidence", "case_editor", { content_fingerprint: "md5:abc" }),
    schema,
  );
  assert.ok(issues.some((item) => item.field === "payload.content_fingerprint" && item.code === "pattern_mismatch"));
});

test("最小范围限制恒为最小访问范围且禁止导出", () => {
  const issues = validateEvent(
    eventOf("ACCESS_RESTRICTED", "access_scope", "governance", {
      scope: "classroom",
      reason_code: "minor_involved",
      export_allowed: true,
      effective_at: NOW,
    }),
    schema,
  );
  assert.ok(issues.some((item) => item.field === "payload.scope" && item.code === "unsupported_value"));
  assert.ok(issues.some((item) => item.field === "payload.export_allowed" && item.code === "unsupported_value"));
});

test("最小范围的材料必须禁止导出", () => {
  const issues = validateEvent(
    eventOf("ACCESS_SCOPED", "access_scope", "rights_reviewer", {
      scope: "minimal",
      export_allowed: true,
      citation_format: "GB/T 7714-2015",
    }),
    schema,
  );
  assert.ok(issues.some((item) => item.field === "payload.export_allowed" && item.code === "implication_violated"));
});

test("课程采用必须钉住正整数案例版本", () => {
  const issues = validateEvent(
    eventOf("COURSE_ADOPTED", "course_adoption", "instructor", { course_id: "course-001", term_id: "2026-autumn", case_version: 0 }),
    schema,
  );
  assert.ok(issues.some((item) => item.field === "payload.case_version" && item.code === "positive_integer"));
});

test("影响评估必须区分课程阶段", () => {
  const issues = validateEvent(
    eventOf("IMPACT_ASSESSED", "course_adoption", "system", { trigger_event_id: "evt-ruling", phase: "finished", action: "none" }),
    schema,
  );
  assert.ok(issues.some((item) => item.field === "payload.phase" && item.code === "unsupported_value"));
});

test("后续处置必须引用当时依据快照", () => {
  const issues = validateEvent(
    eventOf("FOLLOWUP_ISSUED", "course_adoption", "governance", { action: "notify_teacher" }),
    schema,
  );
  assert.ok(issues.some((item) => item.field === "payload.basis_snapshot_id" && item.code === "required"));
});

test("待重审与撤回通知必须携带去重键", () => {
  const rereview = validateEvent(eventOf("REREVIEW_QUEUED", "teaching_case", "system", { review_kind: "fact" }), schema);
  assert.ok(rereview.some((item) => item.field === "payload.dedupe_key" && item.code === "required"));
  const notified = validateEvent(eventOf("WITHDRAWAL_NOTIFIED", "course_adoption", "system", {}), schema);
  assert.ok(notified.some((item) => item.field === "payload.dedupe_key" && item.code === "required"));
});

test("载荷中的生效时间必须携带时区", () => {
  const issues = validateEvent(
    eventOf("ACCESS_REVOKED", "access_scope", "governance", {
      scope: "course",
      effective_at: "2026-10-07T09:30:00",
      reason_code: "license_withdrawn",
    }),
    schema,
  );
  assert.ok(issues.some((item) => item.field === "payload.effective_at" && item.code === "timezone_required"));
});
