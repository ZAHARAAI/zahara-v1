/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  createProviderKey,
  deleteProviderKey,
  listProviderKeys,
  testProviderKey,
  type ProviderKey,
} from "@/services/api";

const PROVIDERS = [
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "groq", label: "Groq" },
];

export default function ProvidersPage() {
  const [keys, setKeys] = useState<ProviderKey[]>([]);
  const [loading, setLoading] = useState(false);

  const [provider, setProvider] = useState("openai");
  const [label, setLabel] = useState("");
  const [secret, setSecret] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void loadKeys();
  }, []);

  async function loadKeys() {
    try {
      setLoading(true);
      const items = await listProviderKeys();
      setKeys(items);
    } catch (err: any) {
      console.error("Failed to load provider keys", err);
      toast.error(err?.message ?? "Failed to load provider keys");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!secret.trim()) {
      toast.error("Secret is required");
      return;
    }
    setSaving(true);
    try {
      const created = await createProviderKey({
        provider,
        label: label || `${provider} key`,
        secret,
      });
      setLabel("");
      setSecret("");
      setKeys((prev) => [...prev, created]);
      toast.success("Provider key added");
    } catch (err: any) {
      console.error("Failed to create provider key", err);
      toast.error(err?.message ?? "Failed to create provider key");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this provider key?")) return;
    try {
      await deleteProviderKey(id);
      setKeys((prev) => prev.filter((k) => k.id !== id));
      toast.success("Provider key deleted");
    } catch (err: any) {
      console.error("Failed to delete provider key", err);
      toast.error(err?.message ?? "Failed to delete provider key");
    }
  }

  async function handleTest(id: string) {
    try {
      const res = await testProviderKey(id);
      toast[res.status === "ok" ? "success" : "error"](
        res.message ?? `Test ${res.status}`
      );
      setKeys((prev) =>
        prev.map((k) =>
          k.id === id
            ? {
                ...k,
                last_test_status: res.status,
                last_tested_at: res.last_tested_at ?? k.last_tested_at,
              }
            : k
        )
      );
    } catch (err: any) {
      console.error("Failed to test provider key", err);
      toast.error(err?.message ?? "Failed to test provider key");
    }
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[16px] font-semibold">Provider Keys</h1>
          <p className="text-[12px] text-[hsl(var(--muted-fg))]">
            Keys configured here are used by the Job 6 run pipeline when calling
            the central LLM router.
          </p>
        </div>
      </div>

      <div className="flex gap-4">
        <form
          onSubmit={handleCreate}
          className="w-80 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--panel))] p-4 flex flex-col gap-3"
        >
          <div className="text-[13px] font-medium">Add provider key</div>

          <div className="flex flex-col gap-1 text-[12px]">
            <label className="text-[11px] text-[hsl(var(--muted-fg))]">
              Provider
            </label>
            <select
              className="rounded-md border border-[hsl(var(--border))] bg-transparent px-2 py-1 text-[12px]"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
            >
              {PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <Input
            label="Label (optional)"
            placeholder="e.g. Primary OpenAI key"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />

          <Input
            label="Secret"
            type="password"
            placeholder="Paste API key…"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
          />

          <Button type="submit" size="sm" disabled={saving}>
            {saving ? "Saving…" : "Add key"}
          </Button>
        </form>

        <div className="flex-1 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--panel))] p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[13px] font-medium">Existing keys</div>
            <Button size="xs" variant="outline" onClick={() => void loadKeys()}>
              {loading ? "Refreshing…" : "Refresh"}
            </Button>
          </div>

          {keys.length === 0 ? (
            <div className="text-[12px] text-[hsl(var(--muted-fg))]">
              No provider keys configured yet.
            </div>
          ) : (
            <table className="w-full text-[11px]">
              <thead className="text-[hsl(var(--muted-fg))]">
                <tr>
                  <th className="text-left py-1 pr-2">Provider</th>
                  <th className="text-left py-1 pr-2">Label</th>
                  <th className="text-left py-1 pr-2">Status</th>
                  <th className="text-left py-1 pr-2">Last tested</th>
                  <th className="text-right py-1 pl-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => (
                  <tr
                    key={k.id}
                    className="border-t border-[hsl(var(--border))]"
                  >
                    <td className="py-1 pr-2">{k.provider}</td>
                    <td className="py-1 pr-2">{k.label}</td>
                    <td className="py-1 pr-2">
                      {k.last_test_status ? (
                        <span
                          className={[
                            "inline-flex rounded-full px-2 py-0.5 capitalize",
                            k.last_test_status === "ok"
                              ? "bg-emerald-500/10 text-emerald-500"
                              : "bg-red-500/10 text-red-500",
                          ].join(" ")}
                        >
                          {k.last_test_status}
                        </span>
                      ) : (
                        <span className="text-[hsl(var(--muted-fg))]">
                          never
                        </span>
                      )}
                    </td>
                    <td className="py-1 pr-2">
                      {k.last_tested_at
                        ? new Date(k.last_tested_at).toLocaleString()
                        : "—"}
                    </td>
                    <td className="py-1 pl-2 text-right">
                      <div className="inline-flex items-center gap-2">
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={() => void handleTest(k.id)}
                        >
                          Test
                        </Button>
                        <Button
                          size="xs"
                          variant="ghost"
                          onClick={() => void handleDelete(k.id)}
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
