import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { Logger } from 'nestjs-pino';

import { errors } from '../constants/errors.js';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: Logger) {}

  // ValidationPipe puts an array of messages into the response body
  private extractMessage(exception: HttpException): string {
    const response = exception.getResponse();

    if (typeof response === 'string') {
      return response;
    }

    const { message } = response as { message?: string | string[] };

    if (Array.isArray(message)) {
      return message.join(', ');
    }

    return message ?? exception.message;
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();

      response.status(statusCode).json({
        statusCode,
        message: this.extractMessage(exception),
      });

      return;
    }

    this.logger.error({ err: exception }, 'Unhandled exception');

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: errors.SOMETHING_WENT_WRONG,
    });
  }
}
