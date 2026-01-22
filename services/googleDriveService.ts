import { SyncState } from "../types";

// NOTE: In a real production app, this should be an environment variable.
// Since we are in a demo environment, user must replace this.
const CLIENT_ID = '570686176836-dtbdhnverff6qo63tfbgvmrts2oadqmp.apps.googleusercontent.com'; 
const SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.appdata';

/**
 * GoogleDriveService
 * The Cloud Connector.
 * 
 * OPTIMIZATIONS:
 * - Smart Fetch wrapper that detects FormData and handles Content-Type boundaries automatically.
 * - Centralized auth retry logic.
 * - Robust multipart upload construction.
 */
export class GoogleDriveService {
  private static instance: GoogleDriveService;
  private tokenClient: any;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  // Folder IDs cache
  private libraryFolderId: string | null = null;

  private constructor() {}

  public static getInstance(): GoogleDriveService {
    if (!GoogleDriveService.instance) {
      GoogleDriveService.instance = new GoogleDriveService();
    }
    return GoogleDriveService.instance;
  }

  public get isAuthenticated(): boolean {
    return !!this.accessToken && Date.now() < this.tokenExpiry;
  }

  public async init(): Promise<void> {
    if ((window as any).google) {
      this.tokenClient = (window as any).google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: (response: any) => {
          if (response.error !== undefined) {
            throw(response);
          }
          this.accessToken = response.access_token;
          // Expires in typically 3600 seconds
          this.tokenExpiry = Date.now() + (Number(response.expires_in) * 1000) - 60000; 
        },
      });
    }
  }

  public async signIn(): Promise<void> {
    if (!this.tokenClient) await this.init();
    
    return new Promise((resolve) => {
        this.tokenClient.callback = (resp: any) => {
            if (resp.access_token) {
                this.accessToken = resp.access_token;
                this.tokenExpiry = Date.now() + (Number(resp.expires_in) * 1000) - 60000;
                resolve();
            }
        };
        
        if (this.accessToken && Date.now() < this.tokenExpiry) {
            resolve();
        } else {
            this.tokenClient.requestAccessToken({ prompt: 'consent' });
        }
    });
  }

  // -- FILESYSTEM OPERATIONS --

  private async fetch(url: string, options: RequestInit = {}): Promise<Response> {
    if (!this.isAuthenticated) {
        await this.signIn();
    }

    // Prepare Headers
    const headers: Record<string, string> = {
        'Authorization': `Bearer ${this.accessToken}`,
        ...((options.headers as Record<string, string>) || {})
    };

    // INTELLIGENT CONTENT-TYPE HANDLING
    // If body is FormData, DELETE Content-Type so browser sets the Boundary.
    // Otherwise, default to application/json if not set.
    if (options.body instanceof FormData) {
        delete headers['Content-Type'];
    } else if (!headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
    }

    const performRequest = async (authHeaders: any) => {
        return fetch(url, { ...options, headers: authHeaders });
    };

    let response = await performRequest(headers);

    if (response.status === 401) {
        // Token expired. Refresh and retry once.
        await this.signIn();
        headers['Authorization'] = `Bearer ${this.accessToken}`;
        response = await performRequest(headers);
    }
    
    if (!response.ok && response.status !== 404) {
        // Log generic errors, but let caller handle specifics like 404
        console.warn(`[DriveService] Request failed: ${url} (${response.status})`);
    }

    return response;
  }

  public async getUserInfo(): Promise<string> {
      const res = await this.fetch('https://www.googleapis.com/oauth2/v3/userinfo');
      const data = await res.json();
      return data.email;
  }

  public async ensureLibraryFolder(): Promise<string> {
      if (this.libraryFolderId) return this.libraryFolderId;

      const q = "mimeType='application/vnd.google-apps.folder' and name='Flow Library' and trashed=false";
      const res = await this.fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}`);
      const data = await res.json();

      if (data.files && data.files.length > 0) {
          this.libraryFolderId = data.files[0].id;
          return this.libraryFolderId!;
      }

      const createRes = await this.fetch('https://www.googleapis.com/drive/v3/files', {
          method: 'POST',
          body: JSON.stringify({
              name: 'Flow Library',
              mimeType: 'application/vnd.google-apps.folder'
          })
      });
      const createData = await createRes.json();
      this.libraryFolderId = createData.id;
      return this.libraryFolderId!;
  }

  public async uploadFile(name: string, blob: Blob): Promise<string> {
      const folderId = await this.ensureLibraryFolder();
      
      const metadata = {
          name: name,
          parents: [folderId]
      };
      
      const form = new FormData();
      // Google Drive API expects 'metadata' part first as application/json
      form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      // Then the file content
      form.append('file', blob);

      const res = await this.fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
          method: 'POST',
          body: form
      });
      const data = await res.json();
      return data.id;
  }

  public async listBooks(): Promise<any[]> {
      const folderId = await this.ensureLibraryFolder();
      const q = `'${folderId}' in parents and mimeType!='application/vnd.google-apps.folder' and trashed=false`;
      const fields = "files(id, name, modifiedTime, size, mimeType)"; // Added mimeType
      
      const res = await this.fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=${fields}`);
      const data = await res.json();
      return data.files || [];
  }

  public async downloadFile(fileId: string): Promise<ArrayBuffer> {
      const res = await this.fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);
      return res.arrayBuffer();
  }

  public async getSyncState(): Promise<SyncState | null> {
      const q = "name='flow_state.json' and 'appDataFolder' in parents and trashed=false";
      const res = await this.fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&spaces=appDataFolder`);
      const data = await res.json();

      if (!data.files || data.files.length === 0) return null;

      const fileId = data.files[0].id;
      const contentRes = await this.fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);
      try {
          return await contentRes.json();
      } catch {
          return null;
      }
  }

  public async saveSyncState(state: SyncState): Promise<void> {
      const q = "name='flow_state.json' and 'appDataFolder' in parents and trashed=false";
      const listRes = await this.fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&spaces=appDataFolder`);
      const listData = await listRes.json();

      const blob = new Blob([JSON.stringify(state)], { type: 'application/json' });
      
      if (listData.files && listData.files.length > 0) {
          const fileId = listData.files[0].id;
          await this.fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' }, // Explicit for media upload
              body: blob
          });
      } else {
          const metadata = {
              name: 'flow_state.json',
              parents: ['appDataFolder']
          };
          
          const form = new FormData();
          form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
          form.append('file', blob);

          await this.fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
              method: 'POST',
              body: form 
          });
      }
  }
}