type JsonType =
  | { kind: "null" }
  | { kind: "boolean" }
  | { kind: "number" }
  | { kind: "string" }
  | { kind: "array"; items: JsonType }
  | { kind: "object"; fields: Record<string, JsonType> }
  | { kind: "union"; options: JsonType[] };

function merge(a: JsonType, b: JsonType): JsonType {
  if (a.kind === b.kind) {
    if (a.kind === "array") return { kind: "array", items: merge(a.items, (b as any).items) };
    if (a.kind === "object") {
      const af = a.fields;
      const bf = (b as any).fields as Record<string, JsonType>;
      const keys = new Set([...Object.keys(af), ...Object.keys(bf)]);
      const fields: Record<string, JsonType> = {};
      for (const k of keys) {
        if (af[k] && bf[k]) fields[k] = merge(af[k], bf[k]);
        else fields[k] = af[k] ?? bf[k];
      }
      return { kind: "object", fields };
    }
    return a;
  }
  const options = (x: JsonType) => (x.kind === "union" ? x.options : [x]);
  const merged = [...options(a), ...options(b)];

  // de-dup by string signature
  const sig = (t: JsonType): string => {
    if (t.kind === "object") return `object(${Object.keys(t.fields).sort().join(",")})`;
    if (t.kind === "array") return `array(${sig(t.items)})`;
    if (t.kind === "union") return `union(${t.options.map(sig).sort().join("|")})`;
    return t.kind;
  };

  const uniq: JsonType[] = [];
  const seen = new Set<string>();
  for (const t of merged) {
    const s = sig(t);
    if (!seen.has(s)) {
      seen.add(s);
      uniq.push(t);
    }
  }

  return uniq.length === 1 ? uniq[0] : { kind: "union", options: uniq };
}

function inferOne(value: any): JsonType {
  if (value === null) return { kind: "null" };
  if (Array.isArray(value)) {
    if (value.length === 0) return { kind: "array", items: { kind: "null" } };
    return value.map(inferOne).reduce((acc, t) => merge(acc, t), { kind: "null" } as JsonType) as any;
  }
  switch (typeof value) {
    case "boolean":
      return { kind: "boolean" };
    case "number":
      return { kind: "number" };
    case "string":
      return { kind: "string" };
    case "object": {
      const fields: Record<string, JsonType> = {};
      for (const [k, v] of Object.entries(value)) fields[k] = inferOne(v);
      return { kind: "object", fields };
    }
    default:
      return { kind: "string" };
  }
}

export function inferSchemaFromJson(sample: unknown): JsonType {
  return inferOne(sample);
}

export function schemaToPretty(schema: JsonType, indent = 0): string {
  const pad = (n: number) => " ".repeat(n);
  switch (schema.kind) {
    case "null":
    case "boolean":
    case "number":
    case "string":
      return schema.kind;
    case "array":
      return `array<${schemaToPretty(schema.items, indent)}>`;
    case "union":
      return schema.options.map((o) => schemaToPretty(o, indent)).join(" | ");
    case "object": {
      const lines = Object.entries(schema.fields).map(
        ([k, v]) => `${pad(indent + 2)}${k}: ${schemaToPretty(v, indent + 2)}`
      );
      return `{\n${lines.join("\n")}\n${pad(indent)}}`;
    }
  }
}
