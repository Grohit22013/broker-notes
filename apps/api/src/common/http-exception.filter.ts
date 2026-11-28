import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from "@nestjs/common";
import type { ApiErrorBody } from "@broker-notes/shared/dto";
import type { Response } from "express";

/**
 * Every error leaves the API as `{ statusCode, message, field? }`.
 * Unexpected errors are logged server-side and returned as a generic 500 (no stack traces).
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger("HTTP");

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const raw = exception.getResponse();
      const body: ApiErrorBody = { statusCode: status, message: exception.message };
      if (typeof raw === "object" && raw !== null) {
        const r = raw as { message?: unknown; field?: unknown };
        if (typeof r.message === "string") body.message = r.message;
        else if (Array.isArray(r.message) && typeof r.message[0] === "string")
          body.message = r.message[0];
        if (typeof r.field === "string") body.field = r.field;
      }
      res.status(status).json(body);
      return;
    }

    this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    const body: ApiErrorBody = {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: "Something went wrong. Please try again.",
    };
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json(body);
  }
}
