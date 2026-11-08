import { adminClient } from "./supabase-server";
import { scanAllFiles, buildFolderPaths, getStartPageToken, listChanges, type FileMeta } from "./drive";
import { isSupported, unsupportedReason } from "./extract";

export async function fullSync(): Promise<{ discovered: number; queued: number }> {
  const db = adminClient();
  await db.from("sync_state").update({ status: "scanning", error: null }).eq("id", 1);

  try {
    const token = await getStartPageToken();
    const files = await scanAllFiles();
    const paths = buildFolderPaths(files);
    const nonFolders = files.filter(f => f.mimeType !== "application/vnd.google-apps.folder");

    let queued = 0;
    for (const f of nonFolders) {
      const folderPath = f.parents?.length ? (paths.get(f.parents[0]) || "/") : "/";
      const reason = !isSupported(f.mimeType) ? (unsupportedReason(f.mimeType) || "Tidak didukung") : null;

      const { data: existing } = await db.from("documents")
        .select("id, modified_time, index_status, chunk_count")
        .eq("drive_file_id", f.id).single();

      if (existing) {
        const needsReindex =
          !reason && (
            existing.index_status === "pending" ||
            existing.index_status === "failed" ||
            existing.modified_time !== f.modifiedTime ||
            (existing.index_status === "indexed" && (existing.chunk_count || 0) === 0)
          );

        await db.from("documents").update({
          name: f.name, mime_type: f.mimeType, folder_path: folderPath,
          modified_time: f.modifiedTime, size_bytes: f.size ? parseInt(f.size) : null,
          web_view_link: f.webViewLink,
          ...(reason ? { index_status: "unsupported", error: reason } : {}),
          ...(needsReindex ? { index_status: "pending", error: null } : {}),
        }).eq("id", existing.id);
        if (needsReindex) queued++;
      } else {
        await db.from("documents").insert({
          drive_file_id: f.id, name: f.name, mime_type: f.mimeType, folder_path: folderPath,
          modified_time: f.modifiedTime, size_bytes: f.size ? parseInt(f.size) : null,
          web_view_link: f.webViewLink,
          index_status: reason ? "unsupported" : "pending",
          error: reason,
        });
        if (!reason) queued++;
      }
    }

    // Hapus dokumen yang tidak ada lagi di Drive
    const driveIds = new Set(nonFolders.map(f => f.id));
    const { data: allDocs } = await db.from("documents").select("id, drive_file_id");
    for (const doc of (allDocs || [])) {
      if (!driveIds.has(doc.drive_file_id)) {
        await db.from("chunks").delete().eq("document_id", doc.id);
        await db.from("documents").delete().eq("id", doc.id);
      }
    }

    await db.from("sync_state").update({
      status: "idle", change_token: token, last_full_sync: new Date().toISOString(), error: null,
    }).eq("id", 1);

    return { discovered: nonFolders.length, queued };
  } catch (e: any) {
    await db.from("sync_state").update({ status: "error", error: e.message?.slice(0, 1000) }).eq("id", 1);
    throw e;
  }
}

export async function incrementalSync(): Promise<{ changes: number }> {
  const db = adminClient();
  const { data: state } = await db.from("sync_state").select("*").eq("id", 1).single();
  if (!state?.change_token) return { changes: 0 };

  const { changes, newToken } = await listChanges(state.change_token);
  let count = 0;

  for (const ch of changes as any[]) {
    if (ch.changeType !== "file") continue;
    count++;
    if (ch.removed || !ch.file) {
      const { data } = await db.from("documents").select("id").eq("drive_file_id", ch.fileId).single();
      if (data) {
        await db.from("chunks").delete().eq("document_id", data.id);
        await db.from("documents").delete().eq("id", data.id);
      }
    } else {
      const f = ch.file;
      const { data: existing } = await db.from("documents").select("id").eq("drive_file_id", f.id).single();
      if (existing) {
        await db.from("documents").update({
          name: f.name, modified_time: f.modifiedTime, index_status: "pending",
        }).eq("id", existing.id);
      }
    }
  }

  await db.from("sync_state").update({
    change_token: newToken, last_incremental_sync: new Date().toISOString(),
  }).eq("id", 1);

  return { changes: count };
}
