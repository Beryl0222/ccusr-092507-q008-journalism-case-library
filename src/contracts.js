const ENVELOPE_STRING_FIELDS = ["event_id", "event_type", "aggregate_type", "aggregate_id", "actor_role"];
const ENVELOPE_ENUM_FIELDS = ["event_type", "aggregate_type", "actor_role"];

function hasExplicitTimezone(value) {
  return typeof value === "string" && (/Z$/.test(value) || /[+-]\d{2}:\d{2}$/.test(value)) && !Number.isNaN(Date.parse(value));
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function validateEvent(payload, schema) {
  if (!isPlainObject(payload)) {
    return [{ field: "$", code: "object_required", message: "事件必须是 JSON 对象" }];
  }
  const issues = [];
  for (const field of schema.required ?? []) {
    if (!(field in payload)) issues.push({ field, code: "required", message: "缺少必填字段" });
  }
  for (const field of ENVELOPE_STRING_FIELDS) {
    if (field in payload && (typeof payload[field] !== "string" || payload[field].trim() === "")) {
      issues.push({ field, code: "non_empty_string", message: "字段必须是非空字符串" });
    }
  }
  if ("version" in payload && (!Number.isInteger(payload.version) || payload.version < 1)) {
    issues.push({ field: "version", code: "positive_integer", message: "版本必须是正整数" });
  }
  if ("occurred_at" in payload && !hasExplicitTimezone(payload.occurred_at)) {
    issues.push({ field: "occurred_at", code: "timezone_required", message: "发生时间必须包含时区" });
  }
  for (const field of ENVELOPE_ENUM_FIELDS) {
    const allowed = schema.properties?.[field]?.enum ?? [];
    if (typeof payload[field] === "string" && allowed.length > 0 && !allowed.includes(payload[field])) {
      issues.push({ field, code: "unsupported_value", message: "字段值未在契约中登记" });
    }
  }
  if (schema.additionalProperties === false) {
    const registered = new Set([...(schema.required ?? []), ...Object.keys(schema.properties ?? {})]);
    for (const field of Object.keys(payload)) {
      if (!registered.has(field)) issues.push({ field, code: "unsupported_field", message: "字段未在契约中登记" });
    }
  }
  const eventType = payload.event_type;
  if (typeof eventType === "string") {
    const roles = schema.actor_roles_by_event?.[eventType];
    if (roles && typeof payload.actor_role === "string" && !roles.includes(payload.actor_role)) {
      issues.push({ field: "actor_role", code: "role_not_allowed", message: "该角色无权发起此事件类型" });
    }
    const aggregates = schema.aggregate_types_by_event?.[eventType];
    if (aggregates && typeof payload.aggregate_type === "string" && !aggregates.includes(payload.aggregate_type)) {
      issues.push({ field: "aggregate_type", code: "aggregate_mismatch", message: "事件类型与对象类型不匹配" });
    }
  }
  const eventPayload = payload.payload;
  if ("payload" in payload && !isPlainObject(eventPayload)) {
    issues.push({ field: "payload", code: "object_required", message: "事件载荷必须是 JSON 对象" });
  } else if (typeof eventType === "string" && isPlainObject(eventPayload)) {
    for (const field of schema.payload_required_by_event?.[eventType] ?? []) {
      if (!(field in eventPayload)) issues.push({ field: `payload.${field}`, code: "required", message: "事件载荷缺少必填字段" });
    }
    for (const [field, allowed] of Object.entries(schema.payload_enum_by_event?.[eventType] ?? {})) {
      if (field in eventPayload && !allowed.includes(eventPayload[field])) {
        issues.push({ field: `payload.${field}`, code: "unsupported_value", message: "字段值未在契约中登记" });
      }
    }
    for (const [field, pattern] of Object.entries(schema.payload_pattern_by_event?.[eventType] ?? {})) {
      if (field in eventPayload && (typeof eventPayload[field] !== "string" || !new RegExp(pattern).test(eventPayload[field]))) {
        issues.push({ field: `payload.${field}`, code: "pattern_mismatch", message: "字段格式不符合契约要求" });
      }
    }
    for (const field of schema.payload_positive_integer_by_event?.[eventType] ?? []) {
      if (field in eventPayload && (!Number.isInteger(eventPayload[field]) || eventPayload[field] < 1)) {
        issues.push({ field: `payload.${field}`, code: "positive_integer", message: "必须是正整数" });
      }
    }
    for (const field of schema.payload_timezone_by_event?.[eventType] ?? []) {
      if (field in eventPayload && !hasExplicitTimezone(eventPayload[field])) {
        issues.push({ field: `payload.${field}`, code: "timezone_required", message: "时间必须包含时区" });
      }
    }
    for (const rule of schema.payload_implications_by_event?.[eventType] ?? []) {
      const { when, then } = rule;
      // then 字段缺失时由 required 规则报告，此处只检查取值矛盾
      if (eventPayload[when.field] === when.equals && then.field in eventPayload && eventPayload[then.field] !== then.equals) {
        issues.push({ field: `payload.${then.field}`, code: "implication_violated", message: "字段组合违反契约约束" });
      }
    }
  }
  return issues.sort((left, right) => left.field.localeCompare(right.field) || left.code.localeCompare(right.code));
}
