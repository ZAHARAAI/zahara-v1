"use client";

import BuildModal from "@/components/Pro/BuildModal";
import { useRunUIStore } from "@/hooks/useRunUIStore";

export default function RunOverlay() {
  const { open, title, subtitle, hide } = useRunUIStore();

  return (
    <BuildModal
      open={open}
      title={title}
      subtitle={subtitle}
      onCancel={hide}
    />
  );
}
