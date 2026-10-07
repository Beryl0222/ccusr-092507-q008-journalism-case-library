import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { validateEvent } from "../src/contracts.js";

const schema = JSON.parse(await readFile(new URL("../contracts/domain.schema.json", import.meta.url), "utf8"));
const sample = JSON.parse(await readFile(new URL("../data/sample.json", import.meta.url), "utf8"));
const samples = JSON.parse(await readFile(new URL("../data/samples.json", import.meta.url), "utf8"));

test("中文样例通过校验", () => {
  assert.deepEqual(validateEvent(sample, schema), []);
});

test("全部事件类型与聚合类型都有有效样例", () => {
  const eventTypes = [...new Set(samples.map((item) => item.event_type))].toSorted();
  assert.deepEqual(eventTypes, schema.properties.event_type.enum.toSorted());
  const aggregateTypes = [...new Set(samples.map((item) => item.aggregate_type))].toSorted();
  assert.deepEqual(aggregateTypes, schema.properties.aggregate_type.enum.toSorted());
  for (const item of samples) {
    assert.deepEqual(validateEvent(item, schema), [], `${item.event_type} 样例应通过校验`);
  }
});

test("十类版本化对象都在聚合类型中登记", () => {
  const versioned = [
    "source_incident",
    "source_evidence",
    "rights_holder",
    "deidentified_version",
    "ethical_issue",
    "applicable_regulation",
    "textbook_chapter",
    "course_objective",
    "classroom_material",
    "access_scope",
  ];
  for (const item of versioned) {
    assert.ok(schema.properties.aggregate_type.enum.includes(item), `缺少聚合类型 ${item}`);
  }
});

test("缺少信封字段时按稳定顺序报告", () => {
  const issues = validateEvent({}, schema);
  assert.deepEqual(issues.map((item) => item.field), issues.map((item) => item.field).toSorted());
  assert.ok(issues.some((item) => item.field === "event_id"));
});

test("时间必须带时区且版本必须为正整数", () => {
  const issues = validateEvent({ ...sample, occurred_at: "2026-09-24T12:00:00", version: 0 }, schema);
  assert.ok(issues.some((item) => item.field === "occurred_at" && item.code === "timezone_required"));
  assert.ok(issues.some((item) => item.field === "version" && item.code === "positive_integer"));
});

test("事件专属载荷不可缺失", () => {
  const issues = validateEvent({ ...sample, event_type: "CASE_REVIEWED", aggregate_type: "teaching_case", payload: {} }, schema);
  assert.ok(issues.some((item) => item.field === "payload.fact_review_id" && item.code === "required"));
});

test("未知事件类型会被拒绝", () => {
  const issues = validateEvent({ ...sample, event_type: "UNKNOWN" }, schema);
  assert.ok(issues.some((item) => item.field === "event_type" && item.code === "unsupported_value"));
});

test("未登记的信封字段会被拒绝", () => {
  const issues = validateEvent({ ...sample, extra: true }, schema);
  assert.ok(issues.some((item) => item.field === "extra" && item.code === "unsupported_field"));
});

test("事件与聚合类型必须匹配", () => {
  const issues = validateEvent(
    { ...sample, event_type: "COURSE_FROZEN", aggregate_type: "teaching_case", payload: { term_id: "2026-autumn", case_versions: [] } },
    schema,
  );
  assert.ok(issues.some((item) => item.field === "aggregate_type" && item.code === "aggregate_mismatch"));
});

test("载荷中的时间字段必须携带时区", () => {
  const issues = validateEvent(
    { ...sample, event_type: "ACCESS_REVOKED", aggregate_type: "access_scope", payload: { scope: "all", effective_at: "2026-10-01" } },
    schema,
  );
  assert.ok(issues.some((item) => item.field === "payload.effective_at" && item.code === "timezone_required"));
});

test("载荷枚举值未登记会被拒绝", () => {
  const issues = validateEvent(
    { ...sample, event_type: "FACT_REVIEW_COMPLETED", aggregate_type: "fact_review", payload: { reviewer_id: "factchecker-li", verdict: "guessed" } },
    schema,
  );
  assert.ok(issues.some((item) => item.field === "payload.verdict" && item.code === "unsupported_value"));
});

test("必填载荷字段为空字符串会被拒绝", () => {
  const issues = validateEvent(
    {
      ...sample,
      event_type: "CASE_REVIEWED",
      aggregate_type: "teaching_case",
      payload: { fact_review_id: "", rights_review_id: "rights-review-0001", decision: "approved" },
    },
    schema,
  );
  assert.ok(issues.some((item) => item.field === "payload.fact_review_id" && item.code === "non_empty_string"));
});

test("通知必须携带去重键与原因事件", () => {
  const issues = validateEvent(
    { ...sample, event_type: "NOTIFICATION_DISPATCHED", aggregate_type: "notification", payload: { notification_id: "notification-0001", kind: "withdrawal_notice" } },
    schema,
  );
  assert.ok(issues.some((item) => item.field === "payload.dedup_key" && item.code === "required"));
  assert.ok(issues.some((item) => item.field === "payload.caused_by_event_id" && item.code === "required"));
});

test("影响评估只接受备课、授课中、已归档三个阶段", () => {
  const issues = validateEvent(
    {
      ...sample,
      event_type: "IMPACT_ASSESSED",
      aggregate_type: "course_adoption",
      payload: { cause_event_id: "evt-2026-0023", phase: "finished", action: "notify" },
    },
    schema,
  );
  assert.ok(issues.some((item) => item.field === "payload.phase" && item.code === "unsupported_value"));
});
