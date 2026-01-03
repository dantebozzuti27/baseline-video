"use client";

import Link from "next/link";
import { Plus } from "lucide-react";

export default function UploadFAB() {
  return (
    <Link href="/app/upload" className="bvFAB" aria-label="Upload video">
      <Plus size={28} strokeWidth={2.5} />
    </Link>
  );
}

