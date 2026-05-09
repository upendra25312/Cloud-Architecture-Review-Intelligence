import type { Metadata } from "next";
import { AdminCopilot } from "@/components/admin-copilot";

export const metadata: Metadata = {
  title: "Admin Copilot",
  description:
    "Internal administrator workspace for Azure Review Board platform health, scope validation, and future admin copilot tooling."
};

export default function AdminCopilotPage() {
  return <AdminCopilot />;
}
