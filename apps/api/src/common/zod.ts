import { BadRequestException, type PipeTransform } from "@nestjs/common";
import { ApiBody, ApiQuery } from "@nestjs/swagger";
import { z, type ZodType } from "zod";

/**
 * Validates a request body/query with a shared Zod schema (the same schema the web app uses),
 * so frontend and backend can never disagree about what's valid.
 * Errors become `400 { message, field }` — the first problem, ready to show next to an input.
 */
export class ZodPipe<T extends ZodType> implements PipeTransform<unknown, z.output<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.output<T> {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;
    const issue = result.error.issues[0];
    const field = issue?.path[0];
    throw new BadRequestException({
      message: issue?.message ?? "Invalid request",
      ...(typeof field === "string" ? { field } : {}),
    });
  }
}

/** Swagger: document a body using the Zod schema itself (no duplicate DTO classes). */
export function ZodBody(schema: ZodType, description?: string) {
  return ApiBody({
    description,
    schema: z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) as object,
  });
}

/** Swagger: document query parameters from a Zod object schema. */
export function ZodQuery(schema: z.ZodObject) {
  const decorators = Object.keys(schema.shape).map((name) =>
    ApiQuery({ name, required: false, type: String }),
  );
  return (target: object, key?: string | symbol, descriptor?: PropertyDescriptor) => {
    for (const d of decorators) d(target, key as string, descriptor as PropertyDescriptor);
  };
}
