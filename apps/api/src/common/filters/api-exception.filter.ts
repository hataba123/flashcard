import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { Request, Response } from 'express';

interface ErrorResponse {
  code: string;
  message: string;
  details?: unknown;
  traceId?: string;
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request & { id?: string }>();
    const isHttpException = exception instanceof HttpException;
    const status = isHttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const exceptionResponse = isHttpException ? exception.getResponse() : undefined;
    const details = this.getDetails(exceptionResponse);
    const message = this.getMessage(exceptionResponse, status);
    const body: ErrorResponse = {
      code: this.getCode(status),
      message,
      ...(details === undefined ? {} : { details }),
      ...(request.id === undefined ? {} : { traceId: request.id })
    };

    response.status(status).json(body);
  }

  private getMessage(response: string | object | undefined, status: HttpStatus): string {
    if (typeof response === 'string') {
      return response;
    }

    if (response !== undefined && 'message' in response) {
      const message = response.message;
      return Array.isArray(message) ? 'Request validation failed.' : String(message);
    }

    return status >= HttpStatus.INTERNAL_SERVER_ERROR
      ? 'An unexpected error occurred.'
      : 'Request failed.';
  }

  private getDetails(response: string | object | undefined): unknown {
    if (response !== undefined && typeof response !== 'string' && 'message' in response) {
      return Array.isArray(response.message) ? response.message : undefined;
    }

    return undefined;
  }

  private getCode(status: HttpStatus): string {
    return status >= HttpStatus.INTERNAL_SERVER_ERROR ? 'INTERNAL_ERROR' : `HTTP_${status}`;
  }
}
