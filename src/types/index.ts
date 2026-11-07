export type UserRole = "admin" | "member";
export interface UserProfile { id: string; email: string; name: string | null; role: UserRole; }
export interface DriveFile {
  id: string; drive_file_id: string; name: string; mime_type: string; folder_path: string;
  modified_time: string; size_bytes: number | null; web_view_link: string | null;
  index_status: "pending"|"processing"|"indexed"|"failed"|"unsupported";
  chunk_count: number; page_count: number|null; sheet_count: number|null; slide_count: number|null;
  error: string|null; last_indexed_at: string|null;
}
export interface Citation {
  id: string; document_id: string; name: string; mime_type: string; link: string|null;
  location: string; snippet: string;
}
export interface ChatMessage { role: "user"|"assistant"; content: string; citations?: Citation[]; }
export interface SyncStats {
  total_files: number; indexed: number; processing: number; pending: number; failed: number;
  unsupported: number; total_chunks: number; last_sync: string|null;
}
