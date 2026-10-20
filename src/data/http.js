export class AppError extends Error {

  constructor(code, message, { status = null, retryable = false, cause } = {}) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

export function toAppError(error) {
  if (error instanceof AppError) return error;
  return new AppError('NETWORK', '网络连接失败', { retryable: true, cause: error });
}

export async function getJSON(url, { fetchImpl = globalThis.fetch } = {}) {
  let response;
  try {
    response = await fetchImpl(url, { headers: { Accept: 'application/json' } });
  } catch (error) {
    throw new AppError('NETWORK', '网络连接失败', { retryable: true, cause: error });
  }

  if (!response || !response.ok) {
    const status = Number(response?.status) || 0;
    throw new AppError('HTTP', status === 404 ? '内容不存在' : `请求失败（${status}）`, {
      status,
      retryable: status === 429 || status >= 500,
    });
  }

  try {
    return await response.json();
  } catch (error) {
    throw new AppError('PARSE', '数据格式无法解析', { retryable: false, cause: error });
  }
}
