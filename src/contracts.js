function hasExplicitTimezone(value) {
  return typeof value === "string" && (/Z$/.test(value) || /[+-]\d{2}:\d{2}$/.test(value)) && !Number.isNaN(Date.parse(value));
}

export function validateEvent(payload, schema) {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return [{ field: "$", code: "object_required", message: "事件必须是 JSON 对象" }];
  }
  const issues = [];
  for (const field of schema.required ?? []) {
    if (!(field in payload)) issues.push({ field, code: "required", message: "缺少必填字段" });
  }
  if (schema.additionalProperties === false) {
    const allowed = new Set(Object.keys(schema.properties ?? {}));
    for (const field of Object.keys(payload)) {
      if (!allowed.has(field)) issues.push({ field, code: "unsupported_field", message: "字段未在契约中登记" });
    }
  }
  for (const field of ["event_id", "event_type", "aggregate_type", "aggregate_id"]) {
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
  for (const field of ["event_type", "aggregate_type"]) {
    const allowed = schema.properties?.[field]?.enum ?? [];
    if (typeof payload[field] === "string" && allowed.length > 0 && !allowed.includes(payload[field])) {
      issues.push({ field, code: "unsupported_value", message: "字段值未在契约中登记" });
    }
  }
  const allowedAggregates = schema.aggregate_by_event?.[payload.event_type];
  if (allowedAggregates && typeof payload.aggregate_type === "string" && !allowedAggregates.includes(payload.aggregate_type)) {
    issues.push({ field: "aggregate_type", code: "aggregate_mismatch", message: "事件与聚合类型不匹配" });
  }
  const eventPayload = payload.payload;
  if ("payload" in payload && (eventPayload === null || typeof eventPayload !== "object" || Array.isArray(eventPayload))) {
    issues.push({ field: "payload", code: "object_required", message: "事件载荷必须是 JSON 对象" });
  } else if (typeof payload.event_type === "string" && eventPayload && typeof eventPayload === "object") {
    for (const field of schema.payload_required_by_event?.[payload.event_type] ?? []) {
      if (!(field in eventPayload)) {
        issues.push({ field: `payload.${field}`, code: "required", message: "事件载荷缺少必填字段" });
      } else if (typeof eventPayload[field] === "string" && eventPayload[field].trim() === "") {
        issues.push({ field: `payload.${field}`, code: "non_empty_string", message: "字段必须是非空字符串" });
      }
    }
    for (const [field, value] of Object.entries(eventPayload)) {
      if (field.endsWith("_at") && typeof value === "string" && !hasExplicitTimezone(value)) {
        issues.push({ field: `payload.${field}`, code: "timezone_required", message: "时间必须包含时区" });
      }
    }
    for (const [field, allowed] of Object.entries(schema.payload_enum_by_event?.[payload.event_type] ?? {})) {
      if (typeof eventPayload[field] === "string" && !allowed.includes(eventPayload[field])) {
        issues.push({ field: `payload.${field}`, code: "unsupported_value", message: "字段值未在契约中登记" });
      }
    }
  }
  return issues.sort((left, right) => left.field.localeCompare(right.field) || left.code.localeCompare(right.code));
}
