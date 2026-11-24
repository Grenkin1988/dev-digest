/* /agents/:id route — routing only: the screen is AgentDetailView (editor tab in ?tab). */
"use client";

import { useParams } from "next/navigation";
import { AgentDetailView } from "./_components/AgentDetailView";

export default function AgentEditorPage() {
  const { id } = useParams<{ id: string }>();
  return <AgentDetailView id={id} />;
}
