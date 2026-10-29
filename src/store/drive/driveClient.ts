// Low-level Google Drive v3 REST client for the appDataFolder space. This is
// the ONLY module that knows Drive URLs (the §9 boundary). It takes a
// DriveTokenProvider (from the auth layer) and never imports GIS directly.
//
// Error mapping (the parts of the §10 contract that live at the HTTP edge):
//   - 401: one silent re-grant (provider.refreshSilently) + retry; a still-401
//          or a failed re-grant becomes StoreAuthError.
//   - 412: StoreConflictError (If-Match optimistic-concurrency miss on a write).

import type { DriveTokenProvider } from '../../auth';
import { StoreAuthError, StoreConflictError } from '../errors';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

/** Minimal Drive file metadata this app reads back. */
export interface DriveFileMeta {
  id: string;
  name: string;
  appProperties?: Record<string, string>;
}

export class DriveClient {
  private readonly tokens: DriveTokenProvider;

  constructor(tokens: DriveTokenProvider) {
    this.tokens = tokens;
  }

  /** List files in appDataFolder matching a Drive `q` query (all pages). */
  async listFiles(query: string): Promise<DriveFileMeta[]> {
    const files: DriveFileMeta[] = [];
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({
        spaces: 'appDataFolder',
        q: query,
        fields: 'nextPageToken, files(id, name, appProperties)',
        pageSize: '100',
      });
      if (pageToken) params.set('pageToken', pageToken);
      const res = await this.authFetch(`${DRIVE_API}/files?${params.toString()}`);
      if (!res.ok) throw await driveError('list files', res);
      const body = (await res.json()) as { files?: DriveFileMeta[]; nextPageToken?: string };
      if (body.files) files.push(...body.files);
      pageToken = body.nextPageToken;
    } while (pageToken);
    return files;
  }

  /**
   * Download a file's JSON content. Returns the parsed body plus the HTTP ETag
   * (used as the If-Match token on a later write; may be null if the response
   * does not expose the header).
   */
  async downloadJson(id: string): Promise<{ raw: unknown; etag: string | null }> {
    const res = await this.authFetch(`${DRIVE_API}/files/${encodeURIComponent(id)}?alt=media`);
    if (!res.ok) throw await driveError('download file', res);
    const etag = res.headers.get('etag');
    const text = await res.text();
    return { raw: text ? JSON.parse(text) : null, etag };
  }

  /** Create a new JSON file in appDataFolder (multipart: metadata + media). */
  async createJsonFile(
    name: string,
    content: string,
    appProperties?: Record<string, string>,
  ): Promise<DriveFileMeta> {
    const metadata: {
      name: string;
      mimeType: string;
      parents: string[];
      appProperties?: Record<string, string>;
    } = { name, mimeType: 'application/json', parents: ['appDataFolder'] };
    if (appProperties) metadata.appProperties = appProperties;

    const boundary = `attxbnd_${Math.random().toString(36).slice(2)}`;
    const body =
      `--${boundary}\r\n` +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      `${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\n` +
      'Content-Type: application/json\r\n\r\n' +
      `${content}\r\n` +
      `--${boundary}--`;

    const res = await this.authFetch(
      `${DRIVE_UPLOAD}/files?uploadType=multipart&fields=id,name,appProperties`,
      {
        method: 'POST',
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
        body,
      },
    );
    if (!res.ok) throw await driveError('create file', res);
    return (await res.json()) as DriveFileMeta;
  }

  /**
   * Overwrite a file's JSON content (media update). When `ifMatchEtag` is set,
   * sends `If-Match`; a 412 means the file changed underneath us and surfaces
   * as StoreConflictError.
   */
  async updateJsonFile(id: string, content: string, ifMatchEtag?: string | null): Promise<void> {
    // Drive's content update is semantically an HTTP PATCH, but Chrome's CORS
    // preflight for PATCH on the upload endpoint is unreliable — it can return
    // an Access-Control-Allow-Methods list without PATCH (and the preflight
    // cache, which a hard reload does not clear, then pins that failure). POST
    // with X-HTTP-Method-Override: PATCH uses a method the preflight always
    // allows; Drive applies it as the same update.
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-HTTP-Method-Override': 'PATCH',
    };
    if (ifMatchEtag) headers['If-Match'] = ifMatchEtag;

    const res = await this.authFetch(
      `${DRIVE_UPLOAD}/files/${encodeURIComponent(id)}?uploadType=media`,
      { method: 'POST', headers, body: content },
    );
    if (res.status === 412) throw new StoreConflictError();
    if (!res.ok) throw await driveError('update file', res);
  }

  /** Delete a file. A 404 (already gone) is treated as success. */
  async deleteFile(id: string): Promise<void> {
    const res = await this.authFetch(`${DRIVE_API}/files/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (!res.ok && res.status !== 404) throw await driveError('delete file', res);
  }

  /**
   * Fetch with a bearer token, retrying once after a silent token re-grant on
   * 401. A failed re-grant or a persistent 401 becomes StoreAuthError.
   */
  private async authFetch(input: string, init: RequestInit = {}): Promise<Response> {
    const token = this.tokens.getToken() ?? (await this.acquire(() => this.tokens.ensureToken()));
    let res = await this.send(input, init, token);
    if (res.status === 401) {
      const refreshed = await this.acquire(() => this.tokens.refreshSilently());
      res = await this.send(input, init, refreshed);
      if (res.status === 401) throw new StoreAuthError();
    }
    return res;
  }

  private async acquire(get: () => Promise<string>): Promise<string> {
    try {
      return await get();
    } catch {
      throw new StoreAuthError();
    }
  }

  private send(input: string, init: RequestInit, token: string): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);
    return fetch(input, { ...init, headers });
  }
}

async function driveError(context: string, res: Response): Promise<Error> {
  let detail = '';
  try {
    detail = await res.text();
  } catch {
    // body already consumed or unavailable; status alone is enough
  }
  return new Error(`Drive ${context} failed (${res.status})${detail ? `: ${detail.slice(0, 300)}` : ''}`);
}
