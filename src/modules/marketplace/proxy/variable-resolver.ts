// Consumer request থেকে variables resolve করে
// pathTemplate এর {variable} গুলো replace করে

export interface ResolvedVariables {
  path: Record<string, string>;
  query: Record<string, string>;
  headers: Record<string, string>;
  body: unknown;
}

export const resolveVariables = (
  consumerPath: string,
  templatePath: string,
  consumerQuery: Record<string, string>,
  consumerHeaders: Record<string, string>,
  consumerBody: unknown,
): ResolvedVariables => {
  // Path variables extract করা
  // Template: /v6/{apiKey}/latest/{base}
  // Consumer: /latest/USD → base=USD
  const pathVars: Record<string, string> = {};

  const templateParts = templatePath.split("/").filter(Boolean);
  const consumerParts = consumerPath.split("/").filter(Boolean);

  templateParts.forEach((part, i) => {
    if (part.startsWith("{") && part.endsWith("}")) {
      const varName = part.slice(1, -1);
      pathVars[varName] = consumerParts[i] ?? "";
    }
  });

  return {
    path: pathVars,
    query: consumerQuery,
    headers: consumerHeaders,
    body: consumerBody,
  };
};

export const resolvePathTemplate = (
  template: string,
  vars: Record<string, string>,
): string => {
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    return vars[key] ?? "";
  });
};
