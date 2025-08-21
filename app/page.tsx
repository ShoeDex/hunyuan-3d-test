"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Script from "next/script";

type File3D = {
  Type?: string;
  Url?: string;
  PreviewImageUrl?: string;
};

type QueryResponse = {
  Status?: "WAIT" | "RUN" | "FAIL" | "DONE" | string;
  ErrorCode?: string;
  ErrorMessage?: string;
  ResultFile3Ds?: File3D[];
};

type JobHistoryItem = {
  jobId: string;
  createdAt: string;
  updatedAt: string;
  status?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  resultFile3Ds?: File3D[] | null;
};

const STORAGE_KEY = "hunyuan3d_jobs_v1";

function loadHistory(): JobHistoryItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveHistory(items: JobHistoryItem[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {}
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [multiViewMode, setMultiViewMode] = useState(false);
  const [leftFile, setLeftFile] = useState<File | null>(null);
  const [rightFile, setRightFile] = useState<File | null>(null);
  const [frontFile, setFrontFile] = useState<File | null>(null);
  const [backFile, setBackFile] = useState<File | null>(null);
  const [leftPreview, setLeftPreview] = useState<string | null>(null);
  const [rightPreview, setRightPreview] = useState<string | null>(null);
  const [frontPreview, setFrontPreview] = useState<string | null>(null);
  const [backPreview, setBackPreview] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<File3D[] | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [history, setHistory] = useState<JobHistoryItem[]>([]);

  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const hasModel = results && results.length > 0;

  const previewUrl = useMemo(() => {
    const f = (results || [])[0];
    return f?.PreviewImageUrl || null;
  }, [results]);

  const readFileAsBase64 = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(",")[1] || result; // strip data:*;base64,
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const clearPolling = () => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  };

  useEffect(() => {
    try {
      setHistory(loadHistory());
    } catch {}
    return () => clearPolling();
  }, []);

  const upsertHistory = useCallback((item: JobHistoryItem) => {
    setHistory((prev) => {
      const existingIndex = prev.findIndex((j) => j.jobId === item.jobId);
      let next: JobHistoryItem[];
      if (existingIndex >= 0) {
        next = [...prev];
        next[existingIndex] = {
          ...next[existingIndex],
          ...item,
          updatedAt: item.updatedAt,
        };
      } else {
        next = [item, ...prev];
      }
      if (next.length > 20) next = next.slice(0, 20);
      saveHistory(next);
      return next;
    });
  }, []);

  const startPolling = useCallback((jid: string) => {
    clearPolling();
    pollTimerRef.current = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/hunyuan3d/query?jobId=${encodeURIComponent(jid)}`
        );
        const data: QueryResponse = await res.json();
        setStatus(data.Status || null);
        if (data.Status === "DONE") {
          clearPolling();
          setResults(data.ResultFile3Ds || null);
          const nowIso = new Date().toISOString();
          upsertHistory({
            jobId: jid,
            createdAt: nowIso,
            updatedAt: nowIso,
            status: data.Status,
            errorCode: data.ErrorCode || null,
            errorMessage: data.ErrorMessage || null,
            resultFile3Ds: data.ResultFile3Ds || null,
          });
        } else if (data.Status === "FAIL") {
          clearPolling();
          setError(data.ErrorMessage || data.ErrorCode || "Job failed");
          const nowIso = new Date().toISOString();
          upsertHistory({
            jobId: jid,
            createdAt: nowIso,
            updatedAt: nowIso,
            status: data.Status,
            errorCode: data.ErrorCode || null,
            errorMessage: data.ErrorMessage || null,
            resultFile3Ds: data.ResultFile3Ds || null,
          });
        } else if (data.Status === "RUN" || data.Status === "WAIT") {
          const nowIso = new Date().toISOString();
          upsertHistory({
            jobId: jid,
            createdAt: nowIso,
            updatedAt: nowIso,
            status: data.Status,
            errorCode: data.ErrorCode || null,
            errorMessage: data.ErrorMessage || null,
            resultFile3Ds: data.ResultFile3Ds || null,
          });
        }
      } catch (e: any) {
        clearPolling();
        setError(e?.message || "Query failed");
      }
    }, 3000);
  }, []);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    setFile(f);
    if (f) {
      const url = URL.createObjectURL(f);
      setImagePreview(url);
    } else {
      setImagePreview(null);
    }
  };

  const onMultiViewChange = (
    view: "left" | "right" | "front" | "back",
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const f = e.target.files?.[0] || null;
    const url = f ? URL.createObjectURL(f) : null;
    if (view === "left") {
      setLeftFile(f);
      setLeftPreview(url);
    } else if (view === "right") {
      setRightFile(f);
      setRightPreview(url);
    } else if (view === "front") {
      setFrontFile(f);
      setFrontPreview(url);
    } else if (view === "back") {
      setBackFile(f);
      setBackPreview(url);
    }
  };

  const uploadImageAndGetUrl = async (f: File): Promise<string> => {
    const key = `uploads/${crypto.randomUUID()}-${encodeURIComponent(f.name)}`;
    const form = new FormData();
    form.append("file", f);
    form.append("key", key);
    const res = await fetch(`/api/hunyuan3d/upload`, {
      method: "POST",
      body: form,
    });
    if (!res.ok) throw new Error("Upload failed");
    const data = (await res.json()) as { publicUrl?: string };
    if (!data.publicUrl) throw new Error("Upload failed: no URL returned");
    return data.publicUrl;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResults(null);
    setStatus(null);
    setJobId(null);
    setSubmitting(true);
    try {
      let imageBase64: string | undefined;
      const payload: any = {
        resultFormat: "GLB",
        enablePBR: true,
      };

      if (multiViewMode) {
        const entries: Array<{ viewType: string; viewImageUrl: string }> = [];
        if (frontFile) {
          const url = await uploadImageAndGetUrl(frontFile);
          entries.push({
            viewType: "front",
            viewImageUrl: url,
          });
        }
        if (backFile) {
          entries.push({
            viewType: "back",
            viewImageUrl: await uploadImageAndGetUrl(backFile),
          });
        }
        if (leftFile) {
          entries.push({
            viewType: "left",
            viewImageUrl: await uploadImageAndGetUrl(leftFile),
          });
        }
        if (rightFile) {
          entries.push({
            viewType: "right",
            viewImageUrl: await uploadImageAndGetUrl(rightFile),
          });
        }

        if (entries.length === 0) throw new Error("请至少上传一张多视角图片");
        payload.multiViewImages = entries;
        payload.imageUrl = entries[0].viewImageUrl;
      } else {
        if (file) {
          imageBase64 = await readFileAsBase64(file);
        }
        if (imageBase64) payload.imageBase64 = imageBase64;
      }

      const res = await fetch("/api/hunyuan3d/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Submit failed");
      const jid: string | undefined = data?.JobId;
      if (!jid) throw new Error("No JobId returned");
      setJobId(jid);
      setStatus("WAIT");
      const nowIso = new Date().toISOString();
      upsertHistory({
        jobId: jid,
        createdAt: nowIso,
        updatedAt: nowIso,
        status: "WAIT",
        errorCode: null,
        errorMessage: null,
        resultFile3Ds: null,
      });
      startPolling(jid);
    } catch (e: any) {
      setError(e?.message || "Submit error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSelectHistory = (item: JobHistoryItem) => {
    clearPolling();
    setJobId(item.jobId);
    setStatus(item.status || null);
    setError(item.errorMessage || null);
    setResults(item.resultFile3Ds || null);
    if (item.status === "RUN") {
      startPolling(item.jobId);
    }
  };

  const clearHistory = () => {
    const next: JobHistoryItem[] = [];
    setHistory(next);
    saveHistory(next);
  };

  return (
    <div className="min-h-screen p-6 sm:p-10">
      <h1 className="text-2xl font-semibold mb-4">混元 3D 测试</h1>
      <form onSubmit={handleSubmit} className="grid gap-4 max-w-2xl">
        <div className="grid gap-2">
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={multiViewMode}
              onChange={(e) => setMultiViewMode(e.target.checked)}
              disabled={submitting}
            />
            使用多视角模式（left / right / front / back）
          </label>
        </div>

        {!multiViewMode ? (
          <div className="grid gap-2">
            <label className="text-sm text-gray-600 border border-gray-300 rounded-md px-3 py-2">
              上传图片
              <input
                type="file"
                accept="image/*"
                onChange={onFileChange}
                disabled={submitting}
              />
            </label>

            {imagePreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imagePreview}
                alt="preview"
                className="w-48 h-48 object-cover rounded"
              />
            ) : null}
          </div>
        ) : (
          <div className="grid gap-3">
            <div className="grid gap-1">
              <span className="flex items-center gap-2 text-sm text-gray-600 border border-gray-300 rounded-md px-3 py-2">
                Left
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => onMultiViewChange("left", e)}
                  disabled={submitting}
                />
              </span>

              {leftPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={leftPreview}
                  alt="left"
                  className="w-32 h-32 object-cover rounded"
                />
              ) : null}
            </div>
            <div className="grid gap-1">
              <span className="flex items-center gap-2 text-sm text-gray-600 border border-gray-300 rounded-md px-3 py-2">
                Right
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => onMultiViewChange("right", e)}
                  disabled={submitting}
                />
              </span>

              {rightPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={rightPreview}
                  alt="right"
                  className="w-32 h-32 object-cover rounded"
                />
              ) : null}
            </div>
            <div className="grid gap-1">
              <span className="flex items-center gap-2 text-sm text-gray-600 border border-gray-300 rounded-md px-3 py-2">
                Front
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => onMultiViewChange("front", e)}
                  disabled={submitting}
                />
              </span>

              {frontPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={frontPreview}
                  alt="front"
                  className="w-32 h-32 object-cover rounded"
                />
              ) : null}
            </div>
            <div className="grid gap-1">
              <span className="flex items-center gap-2 text-sm text-gray-600 border border-gray-300 rounded-md px-3 py-2">
                Back
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => onMultiViewChange("back", e)}
                  disabled={submitting}
                />
              </span>

              {backPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={backPreview}
                  alt="back"
                  className="w-32 h-32 object-cover rounded"
                />
              ) : null}
            </div>
          </div>
        )}
        <div className="flex gap-3">
          <button
            type="submit"
            className="rounded bg-black text-white px-4 py-2 disabled:opacity-50"
            disabled={submitting}
          >
            {submitting ? "提交中..." : "提交任务"}
          </button>
          {jobId ? (
            <span className="text-sm text-gray-600">JobId: {jobId}</span>
          ) : null}
        </div>
      </form>

      <div className="mt-8 grid gap-3 max-w-3xl">
        {status ? <div className="text-sm">状态：{status}</div> : null}
        {error ? (
          <div className="text-sm text-red-600">错误：{error}</div>
        ) : null}

        {results && results.length > 0 ? (
          <div className="grid gap-4">
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt="preview" className="w-80 rounded" />
            ) : null}

            <div className="grid gap-2">
              <div className="font-medium">生成文件</div>
              <ul className="list-disc pl-6">
                {results.map((f, idx) => (
                  <li key={idx} className="text-sm">
                    <span className="mr-2">{f.Type}</span>
                    {f.Url ? (
                      <a
                        href={f.Url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 underline"
                      >
                        下载
                      </a>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>

            {hasModel && jobId ? (
              <div className="mt-2">
                <Script
                  type="module"
                  src="https://unpkg.com/@google/model-viewer/dist/model-viewer.min.js"
                  strategy="afterInteractive"
                />
                {/* @ts-expect-error model-viewer is a web component */}
                <model-viewer
                  src={`/api/hunyuan3d/query?jobId=${encodeURIComponent(
                    jobId
                  )}&model=true`}
                  poster={previewUrl || undefined}
                  camera-controls
                  auto-rotate
                  crossorigin="anonymous"
                  touch-action="pan-y"
                  style={{
                    width: "100%",
                    height: "480px",
                    background: "#f3f4f6",
                    borderRadius: 8,
                    display: "block",
                    position: "relative",
                    contain: "strict",
                  }}
                />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="mt-10 max-w-4xl">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-medium">历史记录</h2>
          <button
            onClick={clearHistory}
            className="text-sm text-gray-600 hover:text-black underline"
          >
            清空
          </button>
        </div>
        {history.length === 0 ? (
          <div className="text-sm text-gray-500">暂无记录</div>
        ) : (
          <ul className="divide-y rounded border">
            {history.map((h) => (
              <li
                key={h.jobId}
                className="p-3 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="text-sm font-mono truncate">{h.jobId}</div>
                  <div className="text-xs text-gray-600">
                    {new Date(h.updatedAt).toLocaleString()}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs px-2 py-0.5 rounded bg-gray-100">
                    {h.status || "-"}
                  </span>
                  <button
                    onClick={() => handleSelectHistory(h)}
                    className="text-sm px-3 py-1 rounded bg-black text-white"
                  >
                    查看
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
