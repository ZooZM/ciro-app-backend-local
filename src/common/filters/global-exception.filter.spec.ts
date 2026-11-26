import {
  ConflictException,
  BadRequestException,
  ArgumentsHost,
} from '@nestjs/common';
import { GlobalExceptionFilter } from './global-exception.filter';

function run(exception: unknown) {
  const json = jest.fn();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const response = { status: jest.fn((_code: number) => ({ json })) };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => ({ url: '/x' }),
    }),
  } as unknown as ArgumentsHost;
  new GlobalExceptionFilter().catch(exception, host);
  return {
    status: response.status.mock.calls[0][0],
    body: json.mock.calls[0][0] as Record<string, unknown>,
  };
}

describe('GlobalExceptionFilter (026: optional data)', () => {
  it('forwards `data` into the error envelope (e.g. the pending request in a 409)', () => {
    const { status, body } = run(
      new ConflictException({
        error: 'REQUEST_ALREADY_PENDING',
        message: 'm',
        data: { pending: { id: 'r1' } },
      }),
    );
    expect(status).toBe(409);
    expect(body).toEqual({
      success: false,
      error: 'REQUEST_ALREADY_PENDING',
      message: 'm',
      statusCode: 409,
      data: { pending: { id: 'r1' } },
    });
  });

  it('leaves the output unchanged when there is no `data`', () => {
    const { body } = run(
      new BadRequestException({
        error: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'm',
      }),
    );
    expect(body).toEqual({
      success: false,
      error: 'IDEMPOTENCY_KEY_REQUIRED',
      message: 'm',
      statusCode: 400,
    });
    expect(body).not.toHaveProperty('data');
  });

  it('keeps the validation shape (message array) untouched', () => {
    const { body } = run(
      new BadRequestException(['amountHalalas must be an integer']),
    );
    expect(body.message).toEqual(['amountHalalas must be an integer']);
    expect(body).not.toHaveProperty('data');
  });
});
