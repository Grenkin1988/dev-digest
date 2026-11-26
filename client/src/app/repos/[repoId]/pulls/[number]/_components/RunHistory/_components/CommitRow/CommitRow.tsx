"use client";

import { Icon } from "@devdigest/ui";
import type { PrCommit } from "@devdigest/shared";
import { s } from "../../styles";

/** A commit marker between runs in the PR timeline. */
export function CommitRow({ commit: c }: { commit: PrCommit }) {
  return (
    <div style={s.commitRow}>
      <Icon.GitCommit size={15} style={s.commitIcon} aria-hidden />
      <span className="mono" style={s.commitSha}>
        {c.sha.slice(0, 7)}
      </span>
      <span style={s.commitMessage} title={c.message}>
        {c.message.split("\n")[0]}
      </span>
      <span style={s.meta}>{c.author}</span>
      {c.committed_at && <span style={s.meta}>{new Date(c.committed_at).toLocaleTimeString()}</span>}
    </div>
  );
}
