import openApiSpecJson from "./openapi.json";

type OpenApiParameter = {
  name: string;
  in: string;
  type?: string;
  required?: boolean;
  default?: unknown;
  enum?: string[];
  maximum?: number;
};

type OpenApiSpec = typeof openApiSpecJson & {
  paths: Record<string, { get: { parameters: OpenApiParameter[] } }>;
};

export const openApiSpec = openApiSpecJson as OpenApiSpec;

export function getQueryParameterNames(path: "/sok" | "/punktsok") {
  return openApiSpec.paths[path].get.parameters
    .filter((parameter) => parameter.in === "query")
    .map((parameter) => parameter.name);
}
