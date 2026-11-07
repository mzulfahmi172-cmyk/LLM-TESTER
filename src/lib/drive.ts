import { google } from "googleapis";

function auth() {
  const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON!);
  return new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });
}

/** ID bisa berupa Shared Drive ID atau folder ID di My Drive. */
const rootId = () => process.env.GOOGLE_SHARED_DRIVE_ID!;

export interface FileMeta {
  id: string; name: string; mimeType: string; parents: string[];
  modifiedTime: string; size: string; webViewLink: string;
}

/** Scan seluruh file di folder (rekursif) atau Shared Drive. */
export async function scanAllFiles(): Promise<FileMeta[]> {
  const drive = google.drive({ version: "v3", auth: auth() });
  const rid = rootId();
  const files: FileMeta[] = [];

  // Cek apakah ini Shared Drive atau folder biasa
  let isSharedDrive = false;
  try {
    await drive.drives.get({ driveId: rid });
    isSharedDrive = true;
  } catch { /* bukan Shared Drive — perlakukan sebagai folder ID */ }

  if (isSharedDrive) {
    let pageToken: string | undefined;
    do {
      const res = await drive.files.list({
        corpora: "drive", driveId: rid, includeItemsFromAllDrives: true, supportsAllDrives: true,
        q: "trashed = false",
        fields: "nextPageToken,files(id,name,mimeType,parents,modifiedTime,size,webViewLink)",
        pageSize: 1000, pageToken,
      });
      files.push(...(res.data.files as FileMeta[] || []));
      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);
  } else {
    // Scan folder di My Drive secara rekursif
    await scanFolder(drive, rid, files);
  }

  return files;
}

async function scanFolder(drive: any, folderId: string, files: FileMeta[]) {
  let pageToken: string | undefined;
  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: "nextPageToken,files(id,name,mimeType,parents,modifiedTime,size,webViewLink)",
      pageSize: 1000, supportsAllDrives: true, includeItemsFromAllDrives: true, pageToken,
    });
    const batch = (res.data.files as FileMeta[]) || [];
    files.push(...batch);
    // Rekursi ke subfolder
    for (const f of batch) {
      if (f.mimeType === "application/vnd.google-apps.folder") {
        await scanFolder(drive, f.id, files);
      }
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
}

export function buildFolderPaths(files: FileMeta[]): Map<string, string> {
  const folders = new Map<string, string>();
  for (const f of files) if (f.mimeType === "application/vnd.google-apps.folder") folders.set(f.id, f.name);
  const paths = new Map<string, string>();
  function resolve(id: string): string {
    if (paths.has(id)) return paths.get(id)!;
    const name = folders.get(id);
    if (!name) { paths.set(id, "/"); return "/"; }
    const f = files.find(x => x.id === id);
    if (!f?.parents?.length) { paths.set(id, `/${name}`); return `/${name}`; }
    const parent = resolve(f.parents[0]);
    const p = parent === "/" ? `/${name}` : `${parent}/${name}`;
    paths.set(id, p); return p;
  }
  for (const f of files) if (f.parents?.length) resolve(f.parents[0]);
  return paths;
}

const GOOGLE_EXPORT: Record<string, string> = {
  "application/vnd.google-apps.document": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.google-apps.spreadsheet": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.google-apps.presentation": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

export async function downloadFile(fileId: string, mimeType: string): Promise<Buffer> {
  const drive = google.drive({ version: "v3", auth: auth() });
  const exportMime = GOOGLE_EXPORT[mimeType];
  if (exportMime) {
    const res = await drive.files.export({ fileId, mimeType: exportMime }, { responseType: "arraybuffer" });
    return Buffer.from(res.data as ArrayBuffer);
  }
  const res = await drive.files.get({ fileId, alt: "media", supportsAllDrives: true }, { responseType: "arraybuffer" });
  return Buffer.from(res.data as ArrayBuffer);
}

export async function getStartPageToken(): Promise<string> {
  const drive = google.drive({ version: "v3", auth: auth() });
  const res = await drive.changes.getStartPageToken({ supportsAllDrives: true });
  return res.data.startPageToken!;
}

export async function listChanges(pageToken: string) {
  const drive = google.drive({ version: "v3", auth: auth() });
  const res = await drive.changes.list({
    pageToken, includeItemsFromAllDrives: true, supportsAllDrives: true,
    includeRemoved: true, pageSize: 1000,
    fields: "nextPageToken,newStartPageToken,changes(changeType,fileId,removed,file(id,name,mimeType,parents,modifiedTime,size,webViewLink))",
  });
  return { changes: res.data.changes || [], newToken: res.data.newStartPageToken || res.data.nextPageToken };
}
