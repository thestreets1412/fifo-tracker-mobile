import { httpGetText, HttpError, USER_AGENT, type HttpFetch, type HttpResponse } from '../http';

function okResponse(body: string): HttpResponse {
  return { ok: true, status: 200, text: async () => body };
}

describe('httpGetText', () => {
  it('returns the response body and sends the app User-Agent', async () => {
    const seen: Array<{ url: string; headers?: Record<string, string> }> = [];
    const fetchImpl: HttpFetch = async (url, init) => {
      seen.push({ url, headers: init?.headers });
      return okResponse('hello');
    };

    await expect(httpGetText('https://example.test/a', fetchImpl)).resolves.toBe('hello');
    expect(seen).toHaveLength(1);
    expect(seen[0]!.url).toBe('https://example.test/a');
    expect(seen[0]!.headers?.['User-Agent']).toBe(USER_AGENT);
  });

  it('throws HttpError on a non-2xx status, naming the status', async () => {
    const fetchImpl: HttpFetch = async () => ({ ok: false, status: 429, text: async () => '' });
    await expect(httpGetText('https://example.test/b', fetchImpl)).rejects.toThrow(HttpError);
    await expect(httpGetText('https://example.test/b', fetchImpl)).rejects.toThrow(/HTTP 429/);
  });

  it('wraps a transport failure in HttpError rather than leaking it', async () => {
    const fetchImpl: HttpFetch = async () => {
      throw new TypeError('Network request failed');
    };
    await expect(httpGetText('https://example.test/c', fetchImpl)).rejects.toThrow(HttpError);
    await expect(httpGetText('https://example.test/c', fetchImpl)).rejects.toThrow(/Network request failed/);
  });

  it('times out a hanging request and aborts the signal', async () => {
    let aborted = false;
    const fetchImpl: HttpFetch = (_url, init) =>
      new Promise<HttpResponse>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          aborted = true;
          reject(new Error('aborted'));
        });
      });

    await expect(httpGetText('https://example.test/d', fetchImpl, 10)).rejects.toThrow(/timed out after 10ms/);
    expect(aborted).toBe(true);
  });

  it('does not leave a pending timer after a fast success', async () => {
    const fetchImpl: HttpFetch = async () => okResponse('fast');
    await expect(httpGetText('https://example.test/e', fetchImpl, 50)).resolves.toBe('fast');
    // If the timer were still armed, Jest would warn about an open handle.
  });
});
