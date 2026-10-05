"use client";

import { draftHasHardFailure } from "../scripts/draft-approval-policy.mjs";
import {pairTemplateIdsV3} from "@/lib/pose-v3/action-catalog";
import { relationPreviewPoints, fullPoseLayout, undoFullPoseLayout, fullPosePreviewSvg } from "@/lib/pose-v3/preview-layout";

import {overlayFailureTextV3,poseOverlayBindingFailuresV3} from "@/lib/pose-v3/overlays";

import { useEffect, useMemo, useRef, useState } from "react";
import { toPng } from "html-to-image";
import { jsPDF } from "jspdf";
import {
  Archive,
  CircleAlert,
  BookOpen,
  Check,
  ChevronRight,
  Clock3,
  Download,
  FileImage,
  Film,
  FolderKanban,
  ImageIcon,
  LayoutDashboard,
  Library,
  LoaderCircle,
  Lock,
  LockOpen,
  MessageCircle,
  PanelTop,
  Plus,
  RefreshCw,
  Save,
  ScanSearch,
  Settings2,
  Sparkles,
  UserRound,
  WandSparkles,
  Copy,
  Trash2,
  Eye,
  EyeOff,
  Search,
  MoreHorizontal,
  ArrowUpDown,
} from "lucide-react";

const isDisplayableCharacterName = (value: string) => {
  const name = value.trim().replace(/^待创建角色[：:]\s*/, "");
  if (!name || /^(unknown|未命名|未知人物|某人|中文人物|中文角色|待创建人物|新人物)$/i.test(name)) return false;
  return !/^(陌生)?(女孩|男孩|女人|男人|人物|女生|男生|女性|男性)$/.test(name);
};
import type {
  ComicPage,
  PageLayout,
  Shot,
  StudioData,
  TextLayer,
  TextLayerType,
} from "@/lib/types";
import type { StoryAnalysis } from "@/lib/analysis";
import {
  normalizeSemanticReviewItems,
  type SemanticReviewItem,
  type SemanticReviewSubmission,
} from "@/lib/semantic-review";
import { poseDisplayDetails } from "@/lib/pose-display";
import {
  applyPoseControlOverride,
  posePresetCatalog,
  type PoseControlOverrideV1,
  type PoseControlV2,
} from "@/lib/pose-v2";
import { applyPoseControlOverrideV3, poseTemplateRegistryV3, poseTemplateCategoriesV3, type PoseControlV3 } from "@/lib/pose-v3";
import {
  buildGenerationPrompt,
  buildRegionalPrompt,
  buildEffectivePromptPlan,
  suggestPromptFixes,
} from "@/lib/prompts";
import type { PosePoint } from "@/lib/prompts";

type View =
  | "home"
  | "projects"
  | "input"
  | "pipeline"
  | "panel"
  | "layout"
  | "assets"
  | "continuity"
  | "queue"
  | "settings";
const fileUrl = (path: string) => `/api/files?path=${encodeURIComponent(path)}`;
const lastProjectStorageKey = "comic-studio:last-project";
const lastEpisodeStorageKey = (projectId: number) =>
  `comic-studio:last-episode:${projectId}`;
const lastShotStorageKey = (episodeId: number) =>
  `comic-studio:last-shot:${episodeId}`;
const poseEditorLimbs = [
  [1, 2], [1, 5], [2, 3], [3, 4], [5, 6], [6, 7], [1, 8], [8, 9],
  [9, 10], [1, 11], [11, 12], [12, 13], [1, 0], [0, 14], [14, 16],
  [0, 15], [15, 17],
] as const;
const poseEditorColors = [
  "#ff0000", "#ff5500", "#ffaa00", "#ffff00", "#aaff00", "#55ff00",
  "#00ff00", "#00ff55", "#00ffaa", "#00ffff", "#00aaff", "#0055ff",
  "#0000ff", "#5500ff", "#aa00ff", "#ff00ff", "#ff00aa",
];
const clonePosePeople = (people: PosePoint[][] = []) =>
  people.map((person) => person.map((point) => ({ ...point })));
const formatLocalDateTime = (value: string) => {
  if (!value) return "时间未知";
  const normalized = /Z$|[+-]\d\d:\d\d$/.test(value)
    ? value
    : `${value.replace(" ", "T")}Z`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("zh-CN", {
        timeZone: "Asia/Shanghai",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      })
        .format(date)
        .replaceAll("/", "-");
};
const nav: { id: View; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "home", label: "项目首页", icon: LayoutDashboard },
  { id: "projects", label: "作品管理", icon: FolderKanban },
  { id: "input", label: "素材输入", icon: Sparkles },
  { id: "pipeline", label: "剧集流水线", icon: FolderKanban },
  { id: "panel", label: "单格制作", icon: PanelTop },
  { id: "layout", label: "页面排版", icon: Film },
  { id: "assets", label: "角色资产", icon: Library },
  { id: "continuity", label: "连续性", icon: Clock3 },
  { id: "queue", label: "任务队列", icon: RefreshCw },
  { id: "settings", label: "生成设置", icon: Settings2 },
];

export default function Studio() {
  const [view, setView] = useState<View>("home");
  const [data, setData] = useState<StudioData | null>(null);
  const [activeShotId, setActiveShotId] = useState<number | null>(null);
  const [layoutPageId, setLayoutPageId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<{
    progress: number;
    etaSeconds: number;
  } | null>(null);
  const [toast, setToast] = useState("");
  const [toastError, setToastError] = useState(false);
  const pageRef = useRef<HTMLDivElement>(null);
  const saveTimers = useRef(new Map<string, number>());
  const pendingSaves = useRef(new Map<string, Record<string, unknown>>());

  const load = async (projectId?: number, episodeId?: number) => {
    const storedProjectId = Number(window.localStorage.getItem(lastProjectStorageKey));
    const requestedProjectId = projectId || (storedProjectId > 0 ? storedProjectId : undefined);
    const storedEpisodeId = requestedProjectId
      ? Number(window.localStorage.getItem(lastEpisodeStorageKey(requestedProjectId)))
      : 0;
    const requestedEpisodeId = episodeId || (storedEpisodeId > 0 ? storedEpisodeId : undefined);
    const params = new URLSearchParams();
    if (requestedProjectId) params.set("projectId", String(requestedProjectId));
    if (requestedEpisodeId) params.set("episodeId", String(requestedEpisodeId));
    const result = await fetch(
      `/api/studio${params.size ? `?${params}` : ""}`,
      { cache: "no-store" },
    ).then((r) => r.json());
    const resultShots = result.episode.pages.flatMap((page: ComicPage) => page.shots);
    const storedShotId = Number(
      window.localStorage.getItem(lastShotStorageKey(result.episode.id)),
    );
    const restoredShot = resultShots.find((shot: Shot) => shot.id === storedShotId);
    setData(result);
    setActiveShotId(restoredShot?.id ?? resultShots[0]?.id ?? null);
    setLayoutPageId(result.episode.pages[0]?.id ?? null);
    window.localStorage.setItem(lastProjectStorageKey, String(result.project.id));
    window.localStorage.setItem(
      lastEpisodeStorageKey(result.project.id),
      String(result.episode.id),
    );
  };
  useEffect(() => {
    load();
  }, []);
  const shots = useMemo(
    () => data?.episode.pages.flatMap((p) => p.shots) ?? [],
    [data],
  );
  const activeShot = shots.find((s) => s.id === activeShotId) ?? shots[0];
  useEffect(() => {
    if (data?.episode.id && activeShotId)
      window.localStorage.setItem(
        lastShotStorageKey(data.episode.id),
        String(activeShotId),
      );
  }, [data?.episode.id, activeShotId]);
  const flash = (message: string) => {
    setToastError(/失败|错误|冲突|阻断|不能|无法|未通过/.test(message));
    setToast(message);
    setTimeout(() => setToast(""), 2200);
  };

  const patchShot = async (shotId: number, patch: Record<string, unknown>) => {
    setData((current) =>
      current
        ? {
            ...current,
            episode: {
              ...current.episode,
              pages: current.episode.pages.map((page) => ({
                ...page,
                shots: page.shots.map((shot) =>
                  shot.id === shotId ? { ...shot, ...patch } : shot,
                ),
              })),
            },
          }
        : current,
    );
    const key = `shot:${shotId}`;
    pendingSaves.current.set(key, {
      ...pendingSaves.current.get(key),
      ...patch,
    });
    const previous = saveTimers.current.get(key);
    if (previous) window.clearTimeout(previous);
    saveTimers.current.set(
      key,
      window.setTimeout(() => {
        const merged = pendingSaves.current.get(key) ?? {};
        pendingSaves.current.delete(key);
        void fetch("/api/studio", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "updateShot",
            shotId,
            patch: merged,
            projectId: data?.project.id,
            episodeId: data?.episode.id,
          }),
        });
        saveTimers.current.delete(key);
      }, 350),
    );
  };
  const patchEpisode = async (patch: Partial<StudioData["episode"]>) => {
    setData((current) =>
      current
        ? { ...current, episode: { ...current.episode, ...patch } }
        : current,
    );
    const key = `episode:${data?.episode.id}`;
    pendingSaves.current.set(key, {
      ...pendingSaves.current.get(key),
      ...patch,
    });
    const previous = saveTimers.current.get(key);
    if (previous) window.clearTimeout(previous);
    saveTimers.current.set(
      key,
      window.setTimeout(() => {
        const merged = pendingSaves.current.get(key) ?? {};
        pendingSaves.current.delete(key);
        void fetch("/api/studio", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "updateEpisode",
            episodeId: data?.episode.id,
            projectId: data?.project.id,
            patch: merged,
          }),
        });
        saveTimers.current.delete(key);
      }, 450),
    );
  };
  const manageShot = async (
    action: "addShot" | "deleteShot" | "moveShot" | "addPage" | "deletePage",
    payload: Record<string, unknown>,
  ) => {
    const response = await fetch("/api/studio", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, projectId: data?.project.id, ...payload }),
    });
    const result = await response.json();
    setData(result);
    const all = result.episode.pages.flatMap((page: ComicPage) => page.shots);
    setActiveShotId((current) =>
      all.some((shot: Shot) => shot.id === current)
        ? current
        : (all[0]?.id ?? null),
    );
    flash(
      action === "addShot"
        ? "已新增分格"
        : action === "deleteShot"
          ? "分格已删除"
          : action === "addPage"
            ? "已新增漫画页"
            : action === "deletePage"
              ? "漫画页已删除"
              : "分格顺序已调整",
    );
  };
  const selectCandidate = async (shotId: number, candidateId: number) => {
    const result = await fetch("/api/studio", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "selectCandidate",
        shotId,
        candidateId,
        projectId: data?.project.id,
      }),
    }).then((r) => r.json());
    setData(result);
    flash("正式画面已切换");
  };
  const generate = async (
    shotId: number,
    options: {
      promptOverride?: string;
      negativePromptOverride?: string;
      force?: boolean;
      promptMode?: string;
      regionalPromptOverride?: {
        commonPrompt: string;
        characterPrompts: string[];
      };
      poseImageOverride?: string;
      poseControlOverride?: PoseControlOverrideV1;
      width?: number;
      height?: number;
    } = {},
  ) => {
    setBusy(true);
    setGenerationProgress({ progress: 0, etaSeconds: 0 });
    const response = await fetch("/api/studio", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "generate",
        shotId,
        projectId: data?.project.id,
        ...options,
      }),
    });
    const result = await response.json();
    if (!response.ok) {
      setBusy(false);
      setGenerationProgress(null);
      flash(result.error ?? "生成任务创建失败");
      return;
    }
    flash("生成任务已启动，可以继续浏览其他页面");
    const jobId = String(result.jobId);
    const timer = window.setInterval(async () => {
      try {
        const status = await fetch(
          `/api/generation-progress?jobId=${encodeURIComponent(jobId)}`,
          { cache: "no-store" },
        ).then((r) => r.json());
        setGenerationProgress({
          progress: Number(status.progress) || 0,
          etaSeconds: Number(status.etaSeconds) || 0,
        });
        if (status.jobStatus === "awaiting_draft_approval") {
          window.clearInterval(timer);
          setBusy(false);
          setGenerationProgress(null);
          await load(data?.project.id);
          setActiveShotId(shotId);
          flash("构图草稿已完成，请检查后确认成品");
        } else if (status.jobStatus === "draft_blocked") {
          window.clearInterval(timer);
          setBusy(false);
          setGenerationProgress(null);
          await load(data?.project.id);
          setActiveShotId(shotId);
          flash(`草稿已阻断：${status.error ?? "视觉后处理失败，请修改后重试"}`);
        } else if (status.jobStatus === "completed") {
          window.clearInterval(timer);
          setBusy(false);
          setGenerationProgress(null);
          await load(data?.project.id);
          setActiveShotId(shotId);
          flash("候选图生成完成");
        } else if (status.jobStatus === "failed") {
          window.clearInterval(timer);
          setBusy(false);
          setGenerationProgress(null);
          flash(`图片生成失败：${status.error ?? "未知错误"}`);
        }
      } catch {
        window.clearInterval(timer);
        setBusy(false);
        setGenerationProgress(null);
        flash("生成状态连接中断，请刷新后检查候选图");
      }
    }, 2000);
  };
  const handleDraft = async (
    action: "approveDraft" | "rejectDraft" | "approveFinal" | "rejectFinal",
    jobId: number,
    shotId: number,
    semanticReview?: SemanticReviewSubmission,
  ) => {
    setBusy(true);
    const response = await fetch("/api/studio", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, jobId, projectId: data?.project.id, semanticReview }),
    });
    const result = await response.json();
    if (!response.ok) {
      setBusy(false);
      flash(result.error ?? "图片审核操作失败");
      return;
    }
    if (action === "rejectDraft" || action === "rejectFinal" || action === "approveFinal") {
      setBusy(false);
      await load(data?.project.id);
      setActiveShotId(shotId);
      flash(action === "rejectDraft"
        ? "构图草稿已放弃，可修改画面设定后重做"
        : action === "rejectFinal"
          ? "最终图片未通过复核，未写入候选"
          : "最终图片已通过复核并写入正式候选");
      return;
    }
    flash("已确认构图，正在生成单张成品");
    const timer = window.setInterval(async () => {
      const status = await fetch(`/api/generation-progress?jobId=${jobId}`, {
        cache: "no-store",
      })
        .then((r) => r.json())
        .catch(() => null);
      if (!status) return;
      setGenerationProgress({
        progress: Number(status.progress) || 0,
        etaSeconds: Number(status.etaSeconds) || 0,
      });
      if (["awaiting_final_approval", "completed", "failed"].includes(status.jobStatus)) {
        window.clearInterval(timer);
        setBusy(false);
        setGenerationProgress(null);
        await load(data?.project.id);
        setActiveShotId(shotId);
        flash(
          status.jobStatus === "awaiting_final_approval"
            ? "最终图片已生成，请完成最终逐项复核"
            : status.jobStatus === "completed"
            ? "单张成品已生成并复核"
            : `成品生成失败：${status.error ?? "未知错误"}`,
        );
      }
    }, 2000);
  };
  const mutate = async (action: string, payload: Record<string, unknown>) => {
    const response = await fetch("/api/studio", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, projectId: data?.project.id, ...payload }),
    });
    const result = await response.json();
    if (!response.ok) {
      const message = result.error ?? "操作失败，请稍后重试";
      flash(message);
      throw new Error(message);
    }
    setData(result);
    if (action === "queueCodexPage") {
      const pageId = Number(payload.pageId);
      const queued =
        result.episode.pages
          .find((page: ComicPage) => page.id === pageId)
          ?.shots.filter((shot: Shot) => shot.status === "awaiting_codex")
          .length ?? 0;
      flash(
        queued > 0
          ? `当前页 ${queued} 格已加入 Codex 队列，请在对话中让我处理`
          : "当前页没有可入队的分格，请先解锁分格",
      );
    }
    return result;
  };
  const uploadCandidate = async (shotId: number, file: File) => {
    setBusy(true);
    const form = new FormData();
    form.append("shotId", String(shotId));
    form.append("file", file);
    form.append("label", file.name);
    form.append("projectId", String(data?.project.id ?? ""));
    const response = await fetch("/api/candidates", {
      method: "POST",
      body: form,
    });
    const result = await response.json();
    setBusy(false);
    if (!response.ok) {
      flash(result.error ?? "图片导入失败");
      return;
    }
    setData(result);
    flash("候选图已导入并保存");
  };
  const exportPage = async (format: "png" | "pdf") => {
    if (!pageRef.current) return;
    setBusy(true);
    try {
      const exportingPage =
        data?.episode.pages.find((page) => page.id === layoutPageId) ??
        data?.episode.pages[0];
      if (format === "png") {
        const url = await toPng(pageRef.current, {
          pixelRatio: 2,
          backgroundColor: "#ffffff",
        });
        const link = document.createElement("a");
        link.download = `${data?.project.title ?? "漫画"}-第${exportingPage?.number ?? 1}页.png`;
        link.href = url;
        link.click();
      } else {
        const originalPageId = layoutPageId;
        let pdf: jsPDF | null = null;
        for (const [index, page] of (data?.episode.pages ?? []).entries()) {
          setLayoutPageId(page.id);
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          );
          const rendered = pageRef.current;
          if (!rendered || rendered.dataset.pageId !== String(page.id))
            throw new Error(`第 ${page.number} 页渲染失败`);
          await Promise.all(
            Array.from(rendered.querySelectorAll("img")).map((image) =>
              image.complete
                ? Promise.resolve()
                : image.decode().catch(() => undefined),
            ),
          );
          const url = await toPng(rendered, {
            pixelRatio: 2,
            backgroundColor: "#ffffff",
          });
          const config = page.layoutConfig;
          const width = config.ratio === "custom" ? config.width : 900;
          const height =
            config.ratio === "strip"
              ? 1800
              : config.ratio === "square"
                ? 900
                : config.ratio === "custom"
                  ? config.height
                  : 1273;
          if (!pdf)
            pdf = new jsPDF({
              orientation: width > height ? "landscape" : "portrait",
              unit: "px",
              format: [width, height],
            });
          else
            pdf.addPage(
              [width, height],
              width > height ? "landscape" : "portrait",
            );
          pdf.addImage(url, "PNG", 0, 0, width, height, undefined, "FAST");
          if (index % 2 === 1)
            await new Promise((resolve) => setTimeout(resolve, 0));
        }
        setLayoutPageId(originalPageId);
        pdf?.save(`${data?.project.title ?? "漫画"}-完整章节.pdf`);
      }
      flash(`${format.toUpperCase()} 已导出`);
    } catch (error) {
      flash(error instanceof Error ? error.message : "导出失败");
    } finally {
      setBusy(false);
    }
  };

  if (!data)
    return (
      <div className="loading">
        <LoaderCircle className="spin" />
        <span>正在打开小粉漫画制作台…</span>
      </div>
    );
  const completedShots = shots.filter((shot) =>
    shot.candidates.some((candidate) => candidate.selected),
  ).length;
  const pendingShots = shots.length - completedShots;
  const completion = shots.length
    ? Math.round((completedShots / shots.length) * 100)
    : 0;
  return (
    <div className="studio-shell">
      <aside className="sidebar">
        <div className="logo">
          <span>粉</span>
          <div>
            <b>小粉漫画制作台</b>
            <small>AI COMIC STUDIO</small>
          </div>
        </div>
        <label className="project-switch">
          <span>当前作品</span>
          <select
            value={data.project.id}
            onChange={(e) => load(Number(e.target.value))}
          >
            {data.projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.title}
                {data.projects.some(
                  (other) => other.id !== project.id && other.title === project.title,
                )
                  ? ` · #${project.id}`
                  : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="project-switch">
          <span>当前章节</span>
          <select
            value={data.episode.id}
            onChange={(e) => load(data.project.id, Number(e.target.value))}
          >
            {data.episodes.map((episode) => (
              <option key={episode.id} value={episode.id}>
                {episode.title}
              </option>
            ))}
          </select>
        </label>
        <button className="new-project" onClick={() => setView("input")}>
          <Plus size={16} /> 创建新作品
        </button>
        <nav>
          {nav.map((item) => (
            <button
              key={item.id}
              className={view === item.id ? "active" : ""}
              onClick={() => setView(item.id)}
            >
              <item.icon size={17} />
              {item.label}
              {item.id === "pipeline" && pendingShots > 0 && (
                <i>{pendingShots}</i>
              )}
            </button>
          ))}
        </nav>
        <div className="side-project">
          <small>当前项目</small>
          <b>{data.project.title}</b>
          <span>{data.episode.title}</span>
          <div>
            <i style={{ width: `${completion}%` }} />
            <em>制作中 · {completion}%</em>
          </div>
        </div>
        <div className="side-bottom">
          <button onClick={() => setView("settings")}>
            <Settings2 size={16} />
            设置
          </button>
          <span>
            <i />
            本地数据已保存
          </span>
        </div>
      </aside>
      <div className="workspace">
        <header className="workspace-header">
          <div>
            <span>{data.project.title}</span>
            <ChevronRight size={13} />
            <b>{nav.find((n) => n.id === view)?.label}</b>
          </div>
          <div className="header-actions">
            <button onClick={() => flash("所有修改已写入本地数据库")}>
              <Save size={15} /> 已保存
            </button>
            <span className="avatar">小粉</span>
          </div>
        </header>
        <main className="content">
          {view === "home" && (
            <Home
              data={data}
              navigate={setView}
              openShot={(id) => {
                setActiveShotId(id);
                setView("panel");
              }}
            />
          )}
          {view === "projects" && (
            <ProjectManagement
              currentProjectId={data.project.id}
              openProject={(projectId) => {
                load(projectId);
                setView("home");
              }}
              createFromStory={() => setView("input")}
            />
          )}
          {view === "input" && (
            <StoryInput
              projectId={data.project.id}
              projectTitle={data.project.title}
              onCreated={(created) => {
                setData(created);
                if (
                  (created as StudioData & { savedAsMaterial?: boolean })
                    .savedAsMaterial
                ) {
                  setView("home");
                  flash("长篇素材已保存到当前作品素材库");
                  return;
                }
                setActiveShotId(created.episode.pages[0]?.shots[0]?.id ?? null);
                setView("pipeline");
                flash("新剧集已创建，大纲、脚本、分页和分镜已保存");
              }}
            />
          )}
          {view === "pipeline" && (
            <Pipeline
              data={data}
              navigate={setView}
              patchEpisode={patchEpisode}
            />
          )}
          {view === "panel" && activeShot && (
            <PanelEditor
              shot={activeShot}
              shots={shots}
              pages={data.episode.pages}
              assets={data.assets}
              characters={data.characters}
              jobs={data.jobs}
              episodeId={data.episode.id}
              projectId={data.project.id}
              pageNumber={
                data.episode.pages.find((page) => page.id === activeShot.pageId)
                  ?.number ?? 1
              }
              onPick={setActiveShotId}
              patch={patchShot}
              manage={manageShot}
              select={selectCandidate}
              generate={generate}
              handleDraft={handleDraft}
              upload={uploadCandidate}
              mutate={mutate}
              busy={busy}
              generationProgress={generationProgress}
            />
          )}
          {view === "layout" && (
            <>
              <div className="page-tabs">
                {data.episode.pages.map((page) => (
                  <button
                    className={
                      (layoutPageId ?? data.episode.pages[0].id) === page.id
                        ? "active"
                        : ""
                    }
                    onClick={() => setLayoutPageId(page.id)}
                    key={page.id}
                  >
                    第 {page.number} 页<span>{page.shots.length} 格</span>
                  </button>
                ))}
              </div>
              <LayoutEditor
                data={{
                  ...data,
                  episode: {
                    ...data.episode,
                    pages: [
                      data.episode.pages.find(
                        (page) =>
                          page.id ===
                          (layoutPageId ?? data.episode.pages[0].id),
                      ) ?? data.episode.pages[0],
                    ],
                  },
                }}
                pageRef={pageRef}
                exportPage={exportPage}
                mutate={mutate}
                busy={busy}
              />
            </>
          )}
          {view === "assets" && <Assets data={data} />}
          {view === "continuity" && <Continuity data={data} mutate={mutate} refresh={() => load(data.project.id,data.episode.id)} />}
          {view === "queue" && (
            <TaskQueue
              data={data}
              refresh={() => load(data.project.id)}
              flash={flash}
            />
          )}
          {view === "settings" && <GenerationSettings />}
        </main>
      </div>
      {toast && (
        <div className={`toast ${toastError ? "toast-error" : ""}`}>
          {toastError ? <CircleAlert size={16} /> : <Check size={16} />}
          {toast}
        </div>
      )}
    </div>
  );
}

type ManagedProject = {
  id: number; title: string; description: string; coverPath: string; status: "active" | "completed" | "archived";
  createdAt: string; updatedAt: string; episodeCount: number; pageCount: number; shotCount: number; selectedShots: number;
  pendingJobs: number; latestEpisode: string; latestEpisodeId: number | null; latestImagePath: string;
};

function ProjectManagement({
  currentProjectId,
  openProject,
  createFromStory,
}: { currentProjectId: number; openProject: (id: number) => void; createFromStory: () => void }) {
  const [projects, setProjects] = useState<ManagedProject[]>([]);
  const [activities, setActivities] = useState<Array<{ projectId: number; projectTitle: string; episodeTitle: string; createdAt: string }>>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("updated");
  const [dialog, setDialog] = useState<"create" | "edit" | null>(null);
  const [editing, setEditing] = useState<ManagedProject | null>(null);
  const [form, setForm] = useState({ title: "", description: "", status: "active" });
  const [error, setError] = useState("");

  const refresh = async () => {
    const result = await fetch("/api/projects", { cache: "no-store" }).then((r) => r.json());
    setProjects(result.projects || []); setActivities(result.activities || []);
  };
  useEffect(() => { refresh(); }, []);
  const visible = projects.filter((project) =>
    (!query || `${project.title} ${project.description}`.toLowerCase().includes(query.toLowerCase())) &&
    (status === "all" || project.status === status),
  ).sort((a, b) => sort === "created" ? b.id - a.id : sort === "episodes" ? b.episodeCount - a.episodeCount : b.updatedAt.localeCompare(a.updatedAt));
  const totalShots = projects.reduce((sum, p) => sum + p.shotCount, 0);
  const selectedShots = projects.reduce((sum, p) => sum + p.selectedShots, 0);
  const save = async () => {
    setError("");
    const response = await fetch("/api/projects", {
      method: dialog === "edit" ? "PATCH" : "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(dialog === "edit" ? { projectId: editing?.id, patch: form } : form),
    });
    const result = await response.json();
    if (!response.ok) { setError(result.error || "保存失败"); return; }
    setDialog(null); await refresh();
  };
  const remove = async (project: ManagedProject) => {
    if (!window.confirm(`确定删除“${project.title}”吗？\n这会同时删除它的章节、页面、分格、候选图记录和生成任务，无法恢复。`)) return;
    const response = await fetch("/api/projects", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectId: project.id, confirm: true }) });
    if (response.ok) await refresh(); else setError((await response.json()).error || "删除失败");
  };
  const duplicate = async (project: ManagedProject) => {
    await fetch("/api/projects", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "duplicate", projectId: project.id }) });
    await refresh();
  };
  const toggleArchive = async (project: ManagedProject) => {
    await fetch("/api/projects", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectId: project.id, patch: { status: project.status === "archived" ? "active" : "archived" } }) });
    await refresh();
  };
  const openCreate = () => { setForm({ title: "", description: "", status: "active" }); setError(""); setDialog("create"); };
  const openEdit = (project: ManagedProject) => { setEditing(project); setForm({ title: project.title, description: project.description, status: project.status }); setError(""); setDialog("edit"); };
  const progress = (p: ManagedProject) => p.shotCount ? Math.round((p.selectedShots / p.shotCount) * 100) : 0;
  return <>
    <div className="page-title project-management-title"><div><small>PROJECT LIBRARY</small><h1>作品管理</h1><p>管理你的漫画作品、章节和创作进度</p></div><button className="primary" onClick={openCreate}><Plus size={15} /> 创建新作品</button></div>
    <section className="metric-grid project-metrics"><article><FolderKanban size={19} /><div><span>作品总数</span><strong>{projects.length}</strong><small>本地作品库</small></div></article><article><Sparkles size={19} /><div><span>正在创作</span><strong>{projects.filter((p) => p.status === "active").length}</strong><small>未归档作品</small></div></article><article><BookOpen size={19} /><div><span>完成章节</span><strong>{projects.reduce((n, p) => n + (p.status === "completed" ? p.episodeCount : 0), 0)}</strong><small>已完成作品章节</small></div></article><article><RefreshCw size={19} /><div><span>待处理任务</span><strong>{projects.reduce((n, p) => n + p.pendingJobs, 0)}</strong><small>{totalShots ? `${selectedShots}/${totalShots} 格已有正式候选` : "尚未开始制作"}</small></div></article></section>
    <div className="project-toolbar"><label><Search size={15} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索作品名称或简介" /></label><select value={status} onChange={(e) => setStatus(e.target.value)}><option value="all">全部状态</option><option value="active">创作中</option><option value="completed">已完成</option><option value="archived">已归档</option></select><select value={sort} onChange={(e) => setSort(e.target.value)}><option value="updated">最近更新</option><option value="created">创建时间</option><option value="episodes">章节数量</option></select><ArrowUpDown size={15} /></div>
    {error && <div className="config-message">{error}</div>}
    {visible.length ? <div className="project-grid">{visible.map((project) => { const cover = project.coverPath || project.latestImagePath; return <article className={`project-card ${project.id === currentProjectId ? "current" : ""}`} key={project.id}><div className="project-cover">{cover ? <img src={fileUrl(cover)} alt="作品封面" /> : <><span>粉</span><small>尚未生成封面</small></>}</div><div className="project-card-body"><div className="project-card-top"><span className={`project-status ${project.status}`}>{project.status === "active" ? "创作中" : project.status === "completed" ? "已完成" : "已归档"}</span><button className="icon-button" title="更多操作" onClick={() => openEdit(project)}><MoreHorizontal size={16} /></button></div><h2>{project.title}</h2><p>{project.description || "还没有作品简介，开始为这个故事建立第一章吧。"}</p><div className="project-meta"><span>{project.episodeCount} 个章节</span><span>{project.latestEpisode}</span></div><div className="project-progress"><div><span>制作进度</span><b>{progress(project)}%</b></div><i><em style={{ width: `${progress(project)}%` }} /></i></div><div className="project-card-actions"><button className="primary" onClick={() => openProject(project.id)}>继续创作 <ChevronRight size={14} /></button><button onClick={() => openEdit(project)}>编辑</button><button onClick={() => toggleArchive(project)}>{project.status === "archived" ? "恢复" : "归档"}</button><button onClick={() => duplicate(project)}>复制</button><button className="danger-link" onClick={() => remove(project)}>删除</button></div></div></article>; })}</div> : <div className="project-empty"><FolderKanban size={30} /><h2>{projects.length ? "没有符合条件的作品" : "还没有作品"}</h2><p>{projects.length ? "试试调整搜索或筛选条件。" : "从一个故事或空白作品开始，建立你的漫画创作空间。"}</p><button className="primary" onClick={projects.length ? () => { setQuery(""); setStatus("all"); } : openCreate}>{projects.length ? "清除筛选" : "创建第一个作品"}</button>{!projects.length && <button onClick={createFromStory}>从剧情素材开始</button>}</div>}
    <section className="block project-activity"><div className="block-head"><div><small>RECENT ACTIVITY</small><h2>最近活动</h2></div></div>{activities.length ? activities.map((item, index) => <button key={`${item.projectId}-${index}`} onClick={() => openProject(item.projectId)}><span className="activity-dot" /><div><b>{item.projectTitle} · {item.episodeTitle}</b><small>章节已创建或更新</small></div><ChevronRight size={14} /></button>) : <p>创建第一个作品后，最近活动会显示在这里。</p>}</section>
    {dialog && <div className="modal-backdrop"><div className="quick-dialog project-dialog"><small>{dialog === "create" ? "NEW PROJECT" : "EDIT PROJECT"}</small><h2>{dialog === "create" ? "创建新作品" : "编辑作品"}</h2><label>作品名称<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="例如：小粉的美好早晨" /></label><label>作品简介<textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="用一句话描述这个作品" /></label><label>作品状态<select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option value="active">创作中</option><option value="completed">已完成</option><option value="archived">已归档</option></select></label>{error && <div className="config-message">{error}</div>}<footer><button onClick={() => setDialog(null)}>取消</button><button className="primary" onClick={save}>保存作品</button></footer></div></div>}
  </>;
}

function Home({
  data,
  navigate,
  openShot,
}: {
  data: StudioData;
  navigate: (v: View) => void;
  openShot: (id: number) => void;
}) {
  const allShots = data.episode.pages.flatMap((page) => page.shots);
  const pending = allShots.filter(
    (shot) => !shot.candidates.some((candidate) => candidate.selected),
  );
  const completedPages = data.episode.pages.filter(
    (page) =>
      page.shots.length > 0 &&
      page.shots.every((shot) =>
        shot.candidates.some((candidate) => candidate.selected),
      ),
  );
  const recentCandidate = allShots
    .flatMap((shot) => shot.candidates)
    .find((candidate) => candidate.selected);
  const counts = [
    [
      "待制作分镜",
      String(pending.length),
      pending.length ? "需要生成或选择" : "本话已完成",
      ScanSearch,
    ],
    ["漫画页", String(data.episode.pages.length), "本章页面", WandSparkles],
    [
      "已完成页面",
      String(completedPages.length),
      `${completedPages.length}/${data.episode.pages.length}`,
      FileImage,
    ],
    ["角色与资产", String(data.assets.length), "独立参考资产", UserRound],
  ] as const;
  return (
    <>
      <div className="welcome">
        <div>
          <p>晚上好，继续创作吧</p>
          <h1>
            让小粉的故事，<em>一格一格</em>向前走。
          </h1>
          <span>AI 负责生产候选结果，你负责每一个重要决定。</span>
          <div>
            <button onClick={() => navigate("input")}>
              <Plus size={16} />
              创建短篇
            </button>
            <button onClick={() => navigate("input")}>
              <BookOpen size={16} />
              创建长篇连载
            </button>
          </div>
        </div>
        <img
          src={fileUrl("../角色资产/小粉/00-原始参考图.png")}
          alt="小粉角色"
        />
      </div>
      <section className="metric-grid">
        {counts.map(([title, count, note, Icon]) => (
          <article key={title}>
            <Icon size={19} />
            <div>
              <span>{title}</span>
              <strong>{count}</strong>
              <small>{note}</small>
            </div>
          </article>
        ))}
      </section>
      <section className="block">
        <div className="block-head">
          <div>
            <small>RECENT EPISODE</small>
            <h2>最近制作</h2>
          </div>
          <button onClick={() => navigate("pipeline")}>
            查看流水线 <ChevronRight size={14} />
          </button>
        </div>
        <div className="recent-card">
          <img
            src={fileUrl(
              recentCandidate?.imagePath ??
                "../角色资产/小粉/00-原始参考图.png",
            )}
            alt={recentCandidate ? "当前作品正式画面" : "角色参考图"}
          />
          <div className="recent-info">
            <span className="pill">
              {data.episode.kind === "short" ? "日常短篇" : "长篇章节"}
            </span>
            <h3>{data.episode.title}</h3>
            <p>{data.episode.synopsis}</p>
            <div className="stage-list">
              {[
                "素材分析",
                "剧情大纲",
                "漫画脚本",
                "分页",
                "分镜",
                "单格生成",
                "排版",
              ].map((x, i) => (
                <span
                  className={i < 5 ? "done" : i === 5 ? "current" : ""}
                  key={x}
                >
                  <i>{i < 5 ? <Check size={10} /> : i + 1}</i>
                  {x}
                </span>
              ))}
            </div>
            <button onClick={() => navigate("panel")}>
              继续制作 <ChevronRight size={15} />
            </button>
          </div>
        </div>
      </section>
      <section className="two-column">
        <div className="block compact">
          <div className="block-head">
            <div>
              <small>NEEDS ATTENTION</small>
              <h2>等待制作</h2>
            </div>
          </div>
          {pending.slice(0, 2).map((s) => (
            <div className="attention" key={s.id}>
              {s.candidates[0] ? (
                <img src={fileUrl(s.candidates[0].imagePath)} alt="候选图" />
              ) : (
                <span className="empty-thumb">
                  <ImageIcon size={15} />
                </span>
              )}
              <div>
                <b>
                  第{" "}
                  {data.episode.pages.find((page) => page.id === s.pageId)
                    ?.number ?? 1}{" "}
                  页 · 第 {s.position} 格
                </b>
                <span>
                  {s.title} ·{" "}
                  {s.candidates.length
                    ? "候选版本待选择"
                    : "尚未生成或导入画面"}
                </span>
              </div>
              <button onClick={() => openShot(s.id)}>处理</button>
            </div>
          ))}
        </div>
        <div className="block compact">
          <div className="block-head">
            <div>
              <small>CONTINUITY</small>
              <h2>连续性摘要</h2>
            </div>
          </div>
          <div className="continuity-summary">
            <span>当前时间</span>
            <b>{allShots.at(-1)?.timeOfDay || "未设置"}</b>
            <span>当前造型</span>
            <b>
              {allShots.at(-1)?.outfitId || "未设置"} +{" "}
              {allShots.at(-1)?.shoeId || "未设置"}
            </b>
            <span>检查结果</span>
            <b className="ok">
              <Check size={14} /> 根据当前分镜实时检查
            </b>
          </div>
          <button
            className="text-button"
            onClick={() => navigate("continuity")}
          >
            打开连续性档案 →
          </button>
        </div>
      </section>
    </>
  );
}

function StoryInput({
  projectId,
  projectTitle,
  onCreated,
}: {
  projectId: number;
  projectTitle: string;
  onCreated: (data: StudioData) => void;
}) {
  const [text, setText] = useState(
    "小粉下班时遇到大雨，没有带伞。她正准备冒雨回家，一位陌生女孩把伞递给了她。两个人并肩走向车站，小粉第一次觉得这场雨也没有那么糟。",
  );
  const [analysis, setAnalysis] = useState<StoryAnalysis | null>(null);
  const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState<"new_project" | "current_series">(
    "new_project",
  );
  const analyze = async () => {
    setBusy(true);
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    });
    setAnalysis(await response.json());
    setBusy(false);
  };
  const create = async () => {
    if (!analysis) return;
    setBusy(true);
    const response = await fetch("/api/stories", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, analysis, target, projectId }),
    });
    const created = await response.json();
    setBusy(false);
    onCreated(created);
  };
  const change = <K extends keyof StoryAnalysis>(
    key: K,
    value: StoryAnalysis[K],
  ) =>
    setAnalysis((current) =>
      current ? { ...current, [key]: value } : current,
    );
  return (
    <section className="input-page">
      <div className="page-title">
        <small>NEW MATERIAL</small>
        <h1>输入一个故事念头</h1>
        <p>
          先决定它是独立作品，还是已有连载中的新章节。每章默认规划 5～7
          张漫画页。
        </p>
      </div>
      <div className="target-choice">
        <button
          className={target === "new_project" ? "active" : ""}
          onClick={() => setTarget("new_project")}
        >
          <FileImage size={17} />
          <span>
            <b>创建独立作品</b>
            <small>默认选项，不归入《小粉求职记》</small>
          </span>
        </button>
        <button
          className={target === "current_series" ? "active" : ""}
          onClick={() => setTarget("current_series")}
        >
          <BookOpen size={17} />
          <span>
            <b>加入《{projectTitle}》</b>
            <small>作为当前作品的新章节</small>
          </span>
        </button>
      </div>
      <div className="input-layout">
        <div className="story-box">
          <label>剧情素材</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="写下故事…"
          />
          <footer>
            <span>{text.length} 字</span>
            <button onClick={analyze} disabled={busy}>
              {busy ? (
                <LoaderCircle className="spin" size={15} />
              ) : (
                <Sparkles size={15} />
              )}
              分析素材
            </button>
          </footer>
        </div>
        {analysis ? (
          <div className="analysis-card">
            <div className="analysis-title">
              <span>
                <Sparkles size={16} />
              </span>
              <div>
                <small>{analysis.analysisSource==="deepseek"?"DEEPSEEK STORY ANALYSIS":"LOCAL RULE FALLBACK"}</small>
                <h2>分析建议（可编辑）</h2>
              </div>
            </div>
            {analysis.analysisWarning&&<p className="config-message">{analysis.analysisWarning}</p>}
            <dl className="editable-analysis">
              <div>
                <dt>素材判断</dt>
                <dd>
                  <select
                    value={analysis.kind}
                    onChange={(e) =>
                      change("kind", e.target.value as StoryAnalysis["kind"])
                    }
                  >
                    <option>日常短篇</option>
                    <option>长篇章节</option>
                    <option>长篇素材</option>
                  </select>
                </dd>
              </div>
              <div>
                <dt>核心主题</dt>
                <dd>
                  <input
                    value={analysis.theme}
                    onChange={(e) => change("theme", e.target.value)}
                  />
                </dd>
              </div>
              <div>
                <dt>情绪曲线</dt>
                <dd>
                  <input
                    value={analysis.emotion.join(" → ")}
                    onChange={(e) =>
                      change(
                        "emotion",
                        e.target.value.split(/\s*[→,，]\s*/).filter(Boolean),
                      )
                    }
                  />
                </dd>
              </div>
              <div>
                <dt>登场角色</dt>
                <dd>
                  <input
                    value={analysis.characters.join("、")}
                    onChange={(e) =>
                      change(
                        "characters",
                        e.target.value.split(/[、,，]/).filter(Boolean),
                      )
                    }
                  />
                </dd>
              </div>
              <div>
                <dt>场景</dt>
                <dd>
                  <input
                    value={analysis.scenes.join("、")}
                    onChange={(e) =>
                      change(
                        "scenes",
                        e.target.value.split(/[、,，]/).filter(Boolean),
                      )
                    }
                  />
                </dd>
              </div>
              <div>
                <dt>漫画页数</dt>
                <dd>
                  <input
                    type="number"
                    min="5"
                    max="7"
                    value={analysis.recommendedPages}
                    onChange={(e) =>
                      change("recommendedPages", Number(e.target.value))
                    }
                  />
                  <small>每页按剧情节奏生成 6～8 格</small>
                </dd>
              </div>
              <div>
                <dt>服装匹配</dt>
                <dd>
                  <input
                    value={analysis.outfitId}
                    onChange={(e) => change("outfitId", e.target.value)}
                  />
                  <input
                    value={analysis.shoeId}
                    onChange={(e) => change("shoeId", e.target.value)}
                  />
                </dd>
              </div>
              <div>
                <dt>影响主线</dt>
                <dd>
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={analysis.affectsMainline}
                      onChange={(e) =>
                        change("affectsMainline", e.target.checked)
                      }
                    />
                    写入连载记忆
                  </label>
                </dd>
              </div>
            </dl>
            <div className="analysis-actions">
              <button onClick={() => setAnalysis(null)}>重新分析</button>
              <button className="primary" onClick={create} disabled={busy}>
                {busy ? (
                  <LoaderCircle className="spin" size={15} />
                ) : (
                  <Plus size={15} />
                )}
                创建作品与完整章节
              </button>
            </div>
          </div>
        ) : (
          <div className="analysis-empty">
            <Sparkles />
            <h3>等待分析</h3>
            <p>系统会提取角色、场景、时间和服装，并给出可修改的创作建议。</p>
          </div>
        )}
      </div>
    </section>
  );
}

function Pipeline({
  data,
  navigate,
  patchEpisode,
}: {
  data: StudioData;
  navigate: (v: View) => void;
  patchEpisode: (patch: Partial<StudioData["episode"]>) => void;
}) {
  const episode = data.episode;
  const panelCount = episode.pages.reduce((n, p) => n + p.shots.length, 0);
  const shots = episode.pages.flatMap((page) => page.shots);
  const selected = shots.filter((shot) =>
    shot.candidates.some((candidate) => candidate.selected),
  ).length;
  const pagesReady =
    episode.pages.length > 0 &&
    episode.pages.every(
      (page) =>
        page.shots.length > 0 &&
        page.shots.every((shot) =>
          shot.candidates.some((candidate) => candidate.selected),
        ),
    );
  const state = (done: boolean, active: boolean = false) =>
    done ? "done" : active ? "active" : "waiting";
  const steps = [
    [
      "素材分析",
      `${String(episode.analysis.kind ?? (episode.kind === "short" ? "日常短篇" : "长篇章节"))} · ${String(episode.analysis.theme ?? episode.synopsis)}`,
      state(Boolean(episode.rawMaterial && episode.analysis.kind)),
    ],
    [
      "剧情大纲",
      `${episode.outline.length} 个剧情节点：${episode.outline.map((x) => x.title).join(" → ") || "尚未生成"}`,
      state(episode.outline.length > 0),
    ],
    [
      "漫画脚本",
      `${episode.script.length} 场戏，画面与对白已分离`,
      state(episode.script.length > 0),
    ],
    [
      "自动分页",
      `${episode.pages.length} 页、${panelCount} 格`,
      state(episode.pages.length >= 1),
    ],
    [
      "分镜设计",
      `${panelCount} 个镜头已写入数据库，可逐格编辑`,
      state(panelCount > 0),
    ],
    [
      "单格生成",
      `${selected}/${shots.length} 格已选择正式画面`,
      state(selected === shots.length, selected < shots.length),
    ],
    [
      "页面排版",
      pagesReady ? "正式画面齐备，可排版" : "等待正式画面确认",
      state(pagesReady, pagesReady),
    ],
    [
      "连续性检查",
      pagesReady ? "可执行连续性检查" : "将在画面完成后执行",
      state(false, pagesReady),
    ],
    [
      "导出",
      pagesReady ? "PNG / 整章 PDF 已就绪" : "等待画面与排版完成",
      state(false, pagesReady),
    ],
  ] as const;
  const updateBeat = (
    index: number,
    key: "title" | "description" | "emotion",
    value: string,
  ) =>
    patchEpisode({
      outline: episode.outline.map((beat, i) =>
        i === index ? { ...beat, [key]: value } : beat,
      ),
    });
  const updateScene = (
    index: number,
    key: "scene" | "timeOfDay" | "summary" | "dialogue",
    value: string,
  ) =>
    patchEpisode({
      script: episode.script.map((scene, i) =>
        i === index ? { ...scene, [key]: value } : scene,
      ),
    });
  return (
    <>
      <div className="page-title row">
        <div>
          <small>EPISODE PIPELINE</small>
          <input
            className="title-editor"
            value={episode.title}
            onChange={(e) => patchEpisode({ title: e.target.value })}
          />
          <textarea
            className="synopsis-editor"
            value={episode.synopsis}
            onChange={(e) => patchEpisode({ synopsis: e.target.value })}
          />
        </div>
        <span className="pill">
          {episode.kind === "short" ? "日常短篇" : "长篇章节"}
        </span>
      </div>
      {episode.outline.length > 0 && (
        <div className="story-structure editable">
          <section>
            <small>原始素材</small>
            <textarea
              value={episode.rawMaterial}
              onChange={(e) => patchEpisode({ rawMaterial: e.target.value })}
            />
          </section>
          <section>
            <small>剧情大纲</small>
            {episode.outline.map((beat, index) => (
              <article key={beat.order}>
                <i>{beat.order}</i>
                <div>
                  <input
                    value={beat.title}
                    onChange={(e) => updateBeat(index, "title", e.target.value)}
                  />
                  <textarea
                    value={beat.description}
                    onChange={(e) =>
                      updateBeat(index, "description", e.target.value)
                    }
                  />
                  <input
                    className="emotion-input"
                    value={beat.emotion}
                    onChange={(e) =>
                      updateBeat(index, "emotion", e.target.value)
                    }
                  />
                </div>
              </article>
            ))}
          </section>
          <section>
            <small>漫画脚本</small>
            {episode.script.map((scene, index) => (
              <article key={scene.order}>
                <i>{scene.order}</i>
                <div>
                  <div className="script-fields">
                    <input
                      value={scene.timeOfDay}
                      onChange={(e) =>
                        updateScene(index, "timeOfDay", e.target.value)
                      }
                    />
                    <input
                      value={scene.scene}
                      onChange={(e) =>
                        updateScene(index, "scene", e.target.value)
                      }
                    />
                  </div>
                  <textarea
                    value={scene.summary}
                    onChange={(e) =>
                      updateScene(index, "summary", e.target.value)
                    }
                  />
                  <input
                    placeholder="对白"
                    value={scene.dialogue}
                    onChange={(e) =>
                      updateScene(index, "dialogue", e.target.value)
                    }
                  />
                </div>
              </article>
            ))}
          </section>
        </div>
      )}
      <div className="pipeline">
        {steps.map(([title, note, status], i) => (
          <article className={status} key={title}>
            <div className="step-no">
              {status === "done" ? <Check size={15} /> : i + 1}
            </div>
            <div>
              <small>STEP {String(i + 1).padStart(2, "0")}</small>
              <h3>{title}</h3>
              <p>{note}</p>
            </div>
            <button
              disabled={status !== "active"}
              onClick={() => navigate("panel")}
            >
              {status === "done"
                ? "已生成"
                : status === "active"
                  ? "继续制作"
                  : "等待上一步"}
              <ChevronRight size={14} />
            </button>
          </article>
        ))}
      </div>
    </>
  );
}

function PanelEditor({
  shot,
  shots,
  pages,
  assets,
  characters,
  jobs,
  episodeId,
  projectId,
  pageNumber,
  onPick,
  patch,
  manage,
  select,
  generate,
  handleDraft,
  upload,
  mutate,
  busy,
  generationProgress,
}: {
  shot: Shot;
  shots: Shot[];
  pages: ComicPage[];
  assets: StudioData["assets"];
  characters: StudioData["characters"];
  jobs: StudioData["jobs"];
  episodeId: number;
  projectId: number;
  pageNumber: number;
  onPick: (id: number) => void;
  patch: (id: number, p: Record<string, unknown>) => void;
  manage: (
    action: "addShot" | "deleteShot" | "moveShot" | "addPage" | "deletePage",
    payload: Record<string, unknown>,
  ) => void;
  select: (s: number, c: number) => void;
  generate: (
    id: number,
    options?: {
      promptOverride?: string;
      negativePromptOverride?: string;
      force?: boolean;
      promptMode?: string;
      regionalPromptOverride?: {
        commonPrompt: string;
        characterPrompts: string[];
      };
      poseImageOverride?: string;
      poseControlOverride?: PoseControlOverrideV1;
      width?: number;
      height?: number;
    },
  ) => void;
  handleDraft: (
    action: "approveDraft" | "rejectDraft" | "approveFinal" | "rejectFinal",
    jobId: number,
    shotId: number,
    semanticReview?: SemanticReviewSubmission,
  ) => void;
  upload: (id: number, file: File) => void;
  mutate: (
    action: string,
    payload: Record<string, unknown>,
  ) => Promise<StudioData>;
  busy: boolean;
  generationProgress: { progress: number; etaSeconds: number } | null;
}) {
  const selected =
    shot.candidates.find((c) => c.selected) ?? shot.candidates[0];
  const latestSdPreviewJob = jobs
    .filter(
      (job) =>
        job.shotId === shot.id &&
        job.provider === "sd-webui",
    )
    .sort((left, right) => right.id - left.id)[0];
  const sdPreview = latestSdPreviewJob && ["awaiting_draft_approval", "awaiting_final_approval", "draft_blocked", "failed"].includes(latestSdPreviewJob.status)
    ? (() => {
      try {
        const payload = JSON.parse(latestSdPreviewJob.payload) as {
          draftImagePath?: string;
          finalReviewImagePath?: string;
          phase?: string;
          recipe?: { semanticQa?: { status?: string }; pixelQa?: { status?: string }; postprocessWarnings?: string[] };
        };
        const stage =
          latestSdPreviewJob.status === "awaiting_final_approval" || (latestSdPreviewJob.status === "failed" && payload.phase === "final") ? "final" : "draft";
        const imagePath =
          stage === "final" ? payload.finalReviewImagePath : payload.draftImagePath;
        if (latestSdPreviewJob.status === "failed" && !imagePath) return null;
        return {
          job: latestSdPreviewJob,
          stage,
          imagePath: imagePath || null,
          blocked: latestSdPreviewJob.status === "failed" || draftHasHardFailure(payload.recipe),
          items: normalizeSemanticReviewItems(payload.recipe?.semanticQa),
        };
      } catch {
        return { job: latestSdPreviewJob, stage: "draft" as const, imagePath: null, blocked: latestSdPreviewJob.status === "draft_blocked", items: [] as SemanticReviewItem[] };
      }
    })()
    : null;
  const pendingSdReview = sdPreview && !sdPreview.blocked && sdPreview.imagePath ? sdPreview : null;
  const latestCodexResult = jobs
    .filter(
      (job) =>
        job.shotId === shot.id &&
        job.provider === "codex" &&
        ["completed", "completed_low_confidence"].includes(job.status),
    )
    .sort((a, b) => b.id - a.id)[0];
  const lowConfidencePreview =
    latestCodexResult?.status === "completed_low_confidence"
      ? (() => {
      try {
        const payload = JSON.parse(latestCodexResult.payload) as {
          selectedImagePath?: string;
          visualReview?: { summaryCn?: string };
        };
        return payload.selectedImagePath
          ? {
              imagePath: payload.selectedImagePath,
              summary: payload.visualReview?.summaryCn || "自动质检未通过",
            }
          : null;
      } catch {
        return null;
      }
        })()
      : null;
  const previewImagePath =
    (sdPreview ? sdPreview.imagePath : null) ??
    (sdPreview ? null : lowConfidencePreview?.imagePath) ??
    (sdPreview ? null : selected?.imagePath);
  const inputRef = useRef<HTMLInputElement>(null);
  const finalizedLegacyJobs = useRef(new Set<number>());
  const [copied, setCopied] = useState(false);
  const [quick, setQuick] = useState<
    null | "expression" | "action" | "camera" | "outfit"
  >(null);
  const [draft, setDraft] = useState("");
  const [inspectorTab, setInspectorTab] = useState<
    "story" | "characters" | "environment"
  >("story");
  const [activeCharacterId, setActiveCharacterId] = useState(
    shot.characterIds[0] || "",
  );
  useEffect(() => {
    if (!shot.characterIds.includes(activeCharacterId))
      setActiveCharacterId(shot.characterIds[0] || "");
  }, [shot.id, shot.characterIds, activeCharacterId]);
  const [promptCollapsed, setPromptCollapsed] = useState(false);
  const [customSize, setCustomSize] = useState({
    width: String(shot.generationWidth),
    height: String(shot.generationHeight),
  });
  useEffect(
    () =>
      setCustomSize({
        width: String(shot.generationWidth),
        height: String(shot.generationHeight),
      }),
    [shot.id, shot.generationWidth, shot.generationHeight],
  );
  const [applyScope, setApplyScope] = useState<"shot" | "page" | "following">(
    "shot",
  );
  const compiled = buildGenerationPrompt(shot, assets, characters);
  const regionalCompiled = buildRegionalPrompt(shot, assets, characters, { posePlannerVersion: "3.0" });
  const {
    prompt: positive,
    negativePrompt,
    quality,
    environment,
    characterLooks,
  } = compiled;
  const [editablePositive, setEditablePositive] = useState(positive);
  const [editableNegative, setEditableNegative] = useState(negativePrompt);
  const [editableCommon, setEditableCommon] = useState(
    regionalCompiled.commonPrompt,
  );
  const [editableRegions, setEditableRegions] = useState(
    regionalCompiled.regionPrompts,
  );
  useEffect(() => {
    if (!pendingSdReview || pendingSdReview.stage !== "final" || finalizedLegacyJobs.current.has(pendingSdReview.job.id)) return;
    finalizedLegacyJobs.current.add(pendingSdReview.job.id);
    handleDraft("approveFinal", pendingSdReview.job.id, shot.id, {
      version: "semantic-review-v1",
      verdicts: {},
      overallConfirmed: true,
      notes: "兼容旧流程：草稿已确认，成品自动加入候选图。",
    });
  }, [pendingSdReview?.job.id, pendingSdReview?.stage, shot.id]);
  const [poseImageOverride, setPoseImageOverride] = useState("");
  const [poseControlOverride, setPoseControlOverride] = useState<PoseControlOverrideV1 | null>(null);
  const [poseEditorOpen, setPoseEditorOpen] = useState(false);
  const [posePreviewMode, setPosePreviewMode] = useState<"full"|"control">("full");
  const [poseEditorLayout, setPoseEditorLayout] = useState<ReturnType<typeof fullPoseLayout>|null>(null);
  const [poseEditorSaving, setPoseEditorSaving] = useState(false);
  const [draggingPosePoint, setDraggingPosePoint] = useState<{
    personIndex: number;
    pointIndex: number;
  } | null>(null);
  const [editablePosePeople, setEditablePosePeople] = useState<PosePoint[][]>(
    () => clonePosePeople(regionalCompiled.poseControl?.people),
  );
  const automaticPoseControlV2 = regionalCompiled.poseControl && "posePlanVersion" in regionalCompiled.poseControl && regionalCompiled.poseControl.posePlanVersion === "2.0"
    ? regionalCompiled.poseControl as PoseControlV2
    : null;
  const automaticPoseControlV3 = regionalCompiled.poseControl && "posePlanVersion" in regionalCompiled.poseControl && regionalCompiled.poseControl.posePlanVersion === "3.0"
    ? regionalCompiled.poseControl as PoseControlV3
    : null;
  const effectivePoseControl = poseControlOverride && automaticPoseControlV3
    ? applyPoseControlOverrideV3(automaticPoseControlV3, poseControlOverride)
    : automaticPoseControlV2 && poseControlOverride
      ? applyPoseControlOverride(automaticPoseControlV2, poseControlOverride)
      : regionalCompiled.poseControl;
  useEffect(() => {
    setEditablePositive(positive);
    setEditableNegative(
      shot.characterIds.length > 1
        ? regionalCompiled.negativePrompt
        : negativePrompt,
    );
    setEditableCommon(regionalCompiled.commonPrompt);
    setEditableRegions(regionalCompiled.regionPrompts);
    setPoseImageOverride("");
    setPoseControlOverride(null);
    setPoseEditorOpen(false);
    setEditablePosePeople(clonePosePeople(regionalCompiled.poseControl?.people));
  }, [shot.id, positive, negativePrompt, regionalCompiled.prompt, regionalCompiled.negativePrompt, shot.characterIds.length]);
  const effectivePositive =
    shot.characterIds.length > 1
      ? [editableCommon, ...editableRegions].join(" BREAK ")
      : editablePositive;
  const promptDirty = shot.characterIds.length > 1
    ? effectivePositive.trim() !== regionalCompiled.prompt.trim() || editableNegative.trim() !== regionalCompiled.negativePrompt.trim()
    : effectivePositive.trim() !== positive.trim() || editableNegative.trim() !== negativePrompt.trim();
  const promptEditorialDiff = shot.characterIds.length === 1 && promptDirty
    ? editablePositive.split(/\s*,\s*/).filter((term) => term.trim() && !positive.toLowerCase().includes(term.trim().toLowerCase())).join(", ")
    : "";
  const prompt = `${effectivePositive}\n\nNegative: ${editableNegative}`;
  const executionPromptPreview=(()=>{
    try {
      const plan=buildEffectivePromptPlan(regionalCompiled,effectivePoseControl?.posePlanVersion==='3.0'?effectivePoseControl as PoseControlV3:null,{useGeometry:shot.poseControlEnabled!==false});
      return {prompt:[plan.commonPrompt,...plan.characterPrompts].join(' BREAK '),errors:plan.errors};
    } catch(error){return {prompt:'',errors:[error instanceof Error?error.message:String(error)]};}
  })();
  const fullPreviewSvg = effectivePoseControl?.posePlanVersion === "3.0" ? fullPosePreviewSvg(effectivePoseControl.fullPeople, effectivePoseControl.scenePlan.projection, effectivePoseControl.width, effectivePoseControl.height, effectivePoseControl.scenePlan.relations) : null;
  const displayedPoseSvg = posePreviewMode === "full" && fullPreviewSvg ? fullPreviewSvg : effectivePoseControl?.svg;
  const posePreview = poseImageOverride || (displayedPoseSvg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(displayedPoseSvg)}` : "");
  const poseDisplay = effectivePoseControl
    ? poseDisplayDetails(effectivePoseControl.kind, effectivePoseControl.source, effectivePoseControl.selectorReason, effectivePoseControl.framingMode)
    : null;
  const effectiveLocomotion = effectivePoseControl && "posePlanVersion" in effectivePoseControl
    ? effectivePoseControl.scenePlan.people.find((person) => person.primaryAction === "locomotion")?.locomotion || null
    : null;
  const availablePosePresets = automaticPoseControlV3
    ? poseTemplateRegistryV3.filter((template) => automaticPoseControlV3.people.length === 2 ? pairTemplateIdsV3.includes(template.id) : !pairTemplateIdsV3.includes(template.id)).map((template) => ({ id: template.id, label: template.label, category: poseTemplateCategoriesV3[template.family] || "其他动作" }))
    : automaticPoseControlV2 ? posePresetCatalog.filter((preset) => preset.peopleCount === automaticPoseControlV2.people.length) : [];
  const actionContractPoseUnavailable=regionalCompiled.repairPasses.actionContractVersion==='story-action-1'&&automaticPoseControlV3==null;
  const effectiveActionGeometry=effectivePoseControl?.posePlanVersion==="3.0"?effectivePoseControl.scenePlan.people[0]?.actionRelationAudit?.geometry:undefined;
  const updatePoseParameters = (patch: Partial<PoseControlOverrideV1>) => {
    if (!automaticPoseControlV2 && !automaticPoseControlV3) return;
    if(patch.conditioning && Object.keys(patch).length===1){setPoseControlOverride({schemaVersion:"pose-override-v1",...(poseControlOverride||{}),conditioning:patch.conditioning});return;}
    const next: PoseControlOverrideV1 = {
      schemaVersion: "pose-override-v1",
      ...(poseControlOverride || {}),
      ...patch,
      ...(patch.templateId && !["stand","sit","crouch","kneel_single","kneel_double","recline","lie_supine","lie_side","lie_prone","walk","run","nod","look_up","head_turn","head_tilt","hold_one","hold_two","phone_one","phone_two"].includes(patch.templateId)?{armTemplateId:"none" as const}:{}),
      ...(patch.templateId && ["stand","sit","crouch","kneel_single","kneel_double","recline","lie_supine","lie_side","lie_prone"].includes(patch.templateId)?{bodyTemplateId:patch.templateId as PoseControlOverrideV1["bodyTemplateId"]}:{}),
      ...(patch.templateId && ["hold_one","hold_two","phone_one","phone_two"].includes(patch.templateId)?{armTemplateId:patch.templateId as PoseControlOverrideV1["armTemplateId"]}:{}),
      people: undefined,
      editMode: "parameter_edit",
    };
    const rebuilt = automaticPoseControlV3 ? applyPoseControlOverrideV3(automaticPoseControlV3, next) : applyPoseControlOverride(automaticPoseControlV2!, next);
    setPoseControlOverride(next);
    setPoseImageOverride("");
    const layout = rebuilt.posePlanVersion === "3.0" ? fullPoseLayout((rebuilt as PoseControlV3).fullPeople,(rebuilt as PoseControlV3).scenePlan.projection,relationPreviewPoints((rebuilt as PoseControlV3).scenePlan.relations)) : null;
    setPoseEditorLayout(layout);
    setEditablePosePeople(clonePosePeople(layout?.people || rebuilt.people));
  };
  const restoreAutomaticPose = () => {
    setPoseImageOverride("");
    setPoseControlOverride(null);
    setEditablePosePeople(clonePosePeople(regionalCompiled.poseControl?.people));
  };
  const restoreSelectedTemplate = () => {
    if ((!automaticPoseControlV2 && !automaticPoseControlV3) || !poseControlOverride) return restoreAutomaticPose();
    const next = { ...poseControlOverride, people: undefined, editMode: "parameter_edit" as const };
    const rebuilt = automaticPoseControlV3 ? applyPoseControlOverrideV3(automaticPoseControlV3, next) : applyPoseControlOverride(automaticPoseControlV2!, next);
    setPoseControlOverride(next);
    setPoseImageOverride("");
    const layout = rebuilt.posePlanVersion === "3.0" ? fullPoseLayout((rebuilt as PoseControlV3).fullPeople,(rebuilt as PoseControlV3).scenePlan.projection,relationPreviewPoints((rebuilt as PoseControlV3).scenePlan.relations)) : null;
    setPoseEditorLayout(layout);
    setEditablePosePeople(clonePosePeople(layout?.people || rebuilt.people));
  };
  const copyPrompt = async () => {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const openOpenPoseEditor = async () => {
    const editorWindow = window.open("about:blank", "_blank");
    if (!editorWindow) {
      window.alert("浏览器阻止了新窗口，请允许此站点打开弹窗后重试。");
      return;
    }
    editorWindow.document.title = "正在打开 3D OpenPose Editor";
    editorWindow.document.body.textContent = "正在连接 3D OpenPose Editor…";
    try {
      const response = await fetch("/api/openpose-editor", {
        cache: "no-store",
      });
      const result = (await response.json()) as {
        url?: string;
        message?: string;
        error?: string;
      };
      if (!response.ok || !result.url) {
        throw new Error(result.error || "没有找到可用的 3D OpenPose Editor。");
      }
      editorWindow.location.replace(result.url);
    } catch (error) {
      editorWindow.close();
      window.alert(
        error instanceof Error
          ? error.message
          : "打开 3D OpenPose Editor 失败。",
      );
    }
  };
  const movePosePoint = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!draggingPosePoint) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width));
    const y = Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height));
    setEditablePosePeople((current) =>
      current.map((person, personIndex) =>
        personIndex !== draggingPosePoint.personIndex
          ? person
          : person.map((point, pointIndex) =>
              pointIndex === draggingPosePoint.pointIndex ? { x, y } : point,
            ),
      ),
    );
  };
  const openCurrentPoseEditor = () => {
    const layout=effectivePoseControl?.posePlanVersion === "3.0" ? fullPoseLayout(effectivePoseControl.fullPeople,effectivePoseControl.scenePlan.projection,relationPreviewPoints(effectivePoseControl.scenePlan.relations)) : null;
    setPoseEditorLayout(layout);
    const people=clonePosePeople(layout?.people || effectivePoseControl?.people);
    if(!people.length||people.some((person)=>person.length<18)) {
      window.alert("当前姿态模板没有可编辑的骨骼节点，请重新生成视觉规格后再试。");
      return;
    }
    setDraggingPosePoint(null);
    setEditablePosePeople(people);
    setPoseEditorOpen(true);
  };
  const applyEditedPose = async () => {
    const poseControl = effectivePoseControl;
    if (!poseControl) return;
    setPoseEditorSaving(true);
    try {
      setPoseControlOverride({
        schemaVersion: "pose-override-v1",
        ...(poseControlOverride || {}),
        people: poseEditorLayout ? undoFullPoseLayout(editablePosePeople,poseEditorLayout) : clonePosePeople(editablePosePeople),
        editMode: "joint_edit",
        coordinateSpace: poseEditorLayout ? "full_pose" : "projected_canvas",
        projectionIntent: "lock_current",
      });
      setPoseImageOverride("");
      setPoseEditorOpen(false);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "保存姿势图失败。");
    } finally {
      setPoseEditorSaving(false);
    }
  };
  const ensureCharacterBindings = () => {
    if (!quality.blockingErrors.length) return true;
    window.alert(
      `请先补齐出场人物：\n${quality.blockingErrors.join("\n")}\n\n请在右侧“人物造型”中勾选剧情实际出场的人物。`,
    );
    return false;
  };
  const generateEditedPrompt = () => {
    if (!ensureCharacterBindings()) return;
    if (
      shot.generationWidth * shot.generationHeight > 512 * 768 &&
      !window.confirm("当前尺寸在 CPU 上可能耗时很长，确定继续吗？")
    )
      return;
    generate(shot.id, {
      promptOverride: shot.characterIds.length === 1 ? promptEditorialDiff : effectivePositive,
      negativePromptOverride: editableNegative,
      regionalPromptOverride:
        shot.characterIds.length > 1
          ? {
              commonPrompt: editableCommon,
              characterPrompts: editableRegions,
            }
          : undefined,
      poseImageOverride: poseImageOverride || undefined,
      poseControlOverride: poseControlOverride || undefined,
      force: true,
      promptMode: promptDirty ? "manual_override" : "structured",
      width: shot.generationWidth,
      height: shot.generationHeight,
    });
  };
  const generateIgnoringWarnings = () => {
    if (!ensureCharacterBindings()) return;
    if (
      quality.valid ||
      window.confirm(
        `当前仍有 ${quality.errors.length} 项提示词风险。确定忽略建议并生成草稿吗？`,
      )
    )
      generate(shot.id, {
        promptOverride: positive,
        negativePromptOverride: negativePrompt,
        force: true,
        promptMode: "forced_structured",
        width: shot.generationWidth,
        height: shot.generationHeight,
      });
  };
  const repairAndGenerate = async () => {
    const suggested = suggestPromptFixes(shot, characters);
    const repairedShot = { ...shot, ...suggested };
    const repaired = buildGenerationPrompt(repairedShot, assets, characters);
    const repairedRegional = buildRegionalPrompt(repairedShot, assets, characters, { posePlannerVersion: "3.0" });
    setEditablePositive(repaired.prompt);
    setEditableNegative(
      repairedShot.characterIds.length > 1
        ? repairedRegional.negativePrompt
        : repaired.negativePrompt,
    );
    setEditableCommon(repairedRegional.commonPrompt);
    setEditableRegions(repairedRegional.regionPrompts);
    if (Object.keys(suggested).length)
      await mutate("updateShot", { shotId: shot.id, patch: suggested });
    if (repaired.quality.blockingErrors.length) {
      window.alert(
        `自动修正不能代替人物绑定：\n${repaired.quality.blockingErrors.join("\n")}\n\n请在右侧“人物造型”中勾选剧情实际出场的人物。`,
      );
      return;
    }
    generate(shot.id, {
      promptOverride: repaired.prompt,
      negativePromptOverride:
        repairedShot.characterIds.length > 1
          ? repairedRegional.negativePrompt
          : repaired.negativePrompt,
      regionalPromptOverride:
        repairedShot.characterIds.length > 1
          ? {
              commonPrompt: repairedRegional.commonPrompt,
              characterPrompts: repairedRegional.regionPrompts,
            }
          : undefined,
      poseImageOverride: poseImageOverride || undefined,
      poseControlOverride: poseControlOverride || undefined,
      force: true,
      promptMode: "auto_repaired",
      width: shot.generationWidth,
      height: shot.generationHeight,
    });
  };
  const pageShots =
    pages.find((page) => page.id === shot.pageId)?.shots ?? shots;
  const outfits = assets.filter(
    (asset) => asset.type === "outfit" && asset.confirmed,
  );
  const shoes = assets.filter(
    (asset) => asset.type === "shoes" && asset.confirmed,
  );
  const openQuick = (kind: typeof quick) => {
    setQuick(kind);
    setDraft(
      kind === "expression"
        ? characterLooks[activeCharacterId]?.expressionEn || shot.expressionEn
        : kind === "action"
          ? characterLooks[activeCharacterId]?.actionEn || shot.actionEn
          : kind === "camera"
            ? shot.cameraEn
            : characterLooks[activeCharacterId]?.outfitId || shot.outfitId,
    );
  };
  const applyQuick = async () => {
    if (!quick) return;
    const chosenOutfit = assets.find((asset) => asset.id === draft);
    const targets =
      quick === "outfit"
        ? applyScope === "page"
          ? pageShots
          : applyScope === "following"
            ? shots.filter(
                (item) =>
                  item.id === shot.id ||
                  item.pageId > shot.pageId ||
                  (item.pageId === shot.pageId &&
                    item.position >= shot.position),
              )
            : [shot]
        : [shot];
    for (const target of targets) {
      if (quick === "camera") {
        await mutate("updateShot", {
          shotId: target.id,
          patch: { cameraEn: draft },
        });
        continue;
      }
      const base =
        target.id === shot.id
          ? characterLooks[activeCharacterId]
          : target.characterLooks?.[activeCharacterId];
      const look = base || characterLooks[activeCharacterId];
      if (!look) continue;
      const next =
        quick === "expression"
          ? { ...look, expressionEn: draft }
          : quick === "action"
            ? { ...look, actionEn: draft }
            : {
                ...look,
                outfitId: draft,
                shoeId: chosenOutfit?.defaultShoeId || look.shoeId,
              };
      await mutate("updateShot", {
        shotId: target.id,
        patch: {
          characterLooks: {
            ...target.characterLooks,
            [activeCharacterId]: next,
          },
        },
      });
    }
    setQuick(null);
  };
  const patchEnvironment = (key: string, value: string) =>
    patch(shot.id, { environment: { ...environment, [key]: value } });
  const patchLook = (key: string, value: string) => {
    const current = characterLooks[activeCharacterId];
    if (!current) return;
    patch(shot.id, {
      characterLooks: {
        ...shot.characterLooks,
        [activeCharacterId]: { ...current, [key]: value },
      },
    });
  };
  const exportCandidate = (candidateId: number) => {
    const link = document.createElement("a");
    link.href = `/api/candidates/export?projectId=${projectId}&candidateId=${candidateId}`;
    link.click();
  };
  const submitReview = (approved: boolean) => {
    if (!pendingSdReview) return;
    const action = approved
      ? pendingSdReview.stage === "draft"
        ? "approveDraft"
        : "approveFinal"
      : pendingSdReview.stage === "draft"
        ? "rejectDraft"
        : "rejectFinal";
    const semanticReview: SemanticReviewSubmission = {
      version: "semantic-review-v1",
      verdicts: {},
      overallConfirmed: approved,
      notes: approved ? "用户已整体确认草稿。" : "用户放弃草稿并重做。",
    };
    handleDraft(action, pendingSdReview.job.id, shot.id, semanticReview);
  };
  return (
    <>
      <div className="page-tabs">
        {pages.map((page) => (
          <button
            className={page.id === shot.pageId ? "active" : ""}
            onClick={() => page.shots[0] && onPick(page.shots[0].id)}
            key={page.id}
          >
            第 {page.number} 页<span>{page.shots.length} 格</span>
          </button>
        ))}
        {pages.length < 7 && (
          <button
            className="page-manage"
            onClick={() => manage("addPage", { episodeId })}
          >
            ＋ 新增页
          </button>
        )}
        {pages.length > 5 && (
          <button
            className="page-manage danger"
            onClick={() => {
              if (
                confirm(
                  `确定删除第 ${pageNumber} 页？该页所有分格和候选版本都会删除。`,
                )
              )
                manage("deletePage", { pageId: shot.pageId });
            }}
          >
            删除本页
          </button>
        )}
      </div>
      <div className="panel-top">
        <div>
          <small>PANEL WORKBENCH</small>
          <h1>
            第 {pageNumber} 页 · 第 {shot.position} 格
          </h1>
        </div>
        <div className="panel-actions">
          <button
            onClick={() =>
              manage("moveShot", { shotId: shot.id, direction: -1 })
            }
          >
            前移
          </button>
          <button
            onClick={() =>
              manage("moveShot", { shotId: shot.id, direction: 1 })
            }
          >
            后移
          </button>
          <button onClick={() => manage("addShot", { pageId: shot.pageId })}>
            新增分格
          </button>
          <button
            className="danger"
            onClick={() => {
              if (
                confirm(
                  `确定删除第 ${shot.position} 格？该格候选版本也会删除。`,
                )
              )
                manage("deleteShot", { shotId: shot.id });
            }}
          >
            删除
          </button>
          <button onClick={() => patch(shot.id, { locked: !shot.locked })}>
            {shot.locked ? <Lock size={15} /> : <LockOpen size={15} />}{" "}
            {shot.locked ? "已锁定" : "锁定角色"}
          </button>
          <button
            onClick={() => mutate("queueCodexPage", { pageId: shot.pageId })}
          >
            <Sparkles size={15} />
            Codex 当前页队列
          </button>
        </div>
      </div>
      <div className="panel-workspace">
        <aside className="shot-rail">
          {pageShots.map((s) => {
            const thumb =
              s.candidates.find((c) => c.selected) ?? s.candidates[0];
            return (
              <button
                className={s.id === shot.id ? "active" : ""}
                onClick={() => onPick(s.id)}
                key={s.id}
              >
                <span>{s.position}</span>
                {thumb ? (
                  <img src={fileUrl(thumb.imagePath)} alt={s.title} />
                ) : (
                  <div className="rail-empty">
                    <ImageIcon size={15} />
                    <small>空</small>
                  </div>
                )}
                <i className={s.locked ? "locked" : ""}>
                  {s.locked ? (
                    <Lock size={10} />
                  ) : s.status === "review" ? (
                    "待选"
                  ) : (
                    ""
                  )}
                </i>
              </button>
            );
          })}
        </aside>
        <section className="canvas-panel">
          <div className={`current-image ${previewImagePath ? "" : "empty"}`}>
            {previewImagePath ? (
              <>
                <img src={fileUrl(previewImagePath)} alt={shot.title} />
                <span>
                  {sdPreview?.blocked
                    ? `任务 #${sdPreview.job.id} · ${sdPreview.stage === "final" ? "正式图" : "草稿"}已阻断 · ${sdPreview.job.stage || "后处理"} · ${sdPreview.job.error || "生成后处理失败"}`
                    : pendingSdReview
                    ? pendingSdReview.stage === "draft"
                      ? "构图草稿 · 等待确认"
                      : "成品生成完成 · 正在加入候选图"
                    : lowConfidencePreview
                    ? "历史生成结果 · 是否采用由你决定"
                    : selected?.qualityStatus === "manual_required"
                      ? "生成结果 · 是否采用由你决定"
                      : "无文字原始画面"}
                </span>
                {!sdPreview && !lowConfidencePreview && selected && (
                  <button
                    className="export-current"
                    onClick={() => exportCandidate(selected.id)}
                  >
                    <Download size={14} />
                    导出原图
                  </button>
                )}
              </>
            ) : (
              <div className="empty-panel">
                <ImageIcon size={42} />
                <h3>{sdPreview ? `任务 #${sdPreview.job.id} 暂无可用预览` : "这一格还没有正式画面"}</h3>
                <p>
                  {sdPreview ? `${sdPreview.job.stage || "后处理"}：${sdPreview.job.error || "草稿图未保存或无法读取"}。本任务不能确认或加入正式候选。` : "先生成低成本构图草稿，确认人数、姿势和构图后再生成单张成品。"}
                </p>
                <div>
                  <button
                    onClick={() =>
                      quality.valid
                        ? generateEditedPrompt()
                        : repairAndGenerate()
                    }
                    disabled={busy || shot.locked}
                  >
                    <WandSparkles size={15} />
                    {busy
                      ? `生成中 ${generationProgress?.progress ?? 0}%`
                      : quality.valid
                        ? "生成构图草稿"
                        : "自动修正并生成草稿"}
                  </button>
                  <button
                    className="primary"
                    onClick={() => inputRef.current?.click()}
                  >
                    <Plus size={15} />
                    导入候选图
                  </button>
                </div>
              </div>
            )}
          </div>
          {sdPreview?.blocked && (
            <section className="semantic-review-panel" aria-label="阻断草稿诊断">
              <header>
                <div><small>{sdPreview.stage === "final" ? "FINAL BLOCKED" : "DRAFT BLOCKED"}</small><h3>任务 #{sdPreview.job.id} · {sdPreview.job.stage || "后处理"}</h3></div>
              </header>
              <p>{sdPreview.job.error || "后处理失败，不能继续生成成品。"}{sdPreview.stage === "final" ? " 已保留正式生成结果供查看，未加入正式候选。" : ""}</p>
              <footer><button onClick={() => quality.valid ? generateEditedPrompt() : repairAndGenerate()} disabled={busy || shot.locked}>修改后重试草稿</button></footer>
            </section>
          )}
          {pendingSdReview?.stage === "draft" && (
            <section className="semantic-review-panel" aria-label="草稿确认">
              <header>
                <div>
                  <small>
                    DRAFT READY
                  </small>
                  <h3>
                    构图草稿已生成
                  </h3>
                </div>
                <span>任务 #{pendingSdReview.job.id}</span>
              </header>
              <footer>
                <button className="danger" onClick={() => submitReview(false)} disabled={busy}>
                  放弃并重做
                </button>
                <button className="primary" onClick={() => submitReview(true)} disabled={busy}>
                  满意，生成正式图
                </button>
              </footer>
            </section>
          )}
          <div className="candidate-strip">
            <div>
              <b>正式候选</b>
              <span>{shot.candidates.length} 个版本 · 草稿不会出现在这里</span>
            </div>
            <div>
              {shot.candidates.map((c) => (
                <button
                  className={c.selected ? "selected" : ""}
                  onClick={() => select(shot.id, c.id)}
                  key={c.id}
                >
                  <img src={fileUrl(c.imagePath)} alt={c.label} />
                  <span>
                    {c.label} · V{c.version}
                  </span>
                  {c.selected && (
                    <i>
                      <Check size={12} />
                      正式
                    </i>
                  )}
                  <em
                    className="candidate-download"
                    role="button"
                    aria-label={`下载候选 V${c.version}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      exportCandidate(c.id);
                    }}
                    title="下载原图"
                  >
                    <Download size={11} />
                  </em>
                </button>
              ))}
              <button
                className="add-candidate"
                onClick={() => inputRef.current?.click()}
              >
                <Plus />
                <span>导入候选图</span>
              </button>
            </div>
            <input
              ref={inputRef}
              hidden
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) upload(shot.id, file);
                e.target.value = "";
              }}
            />
          </div>
          <section
            className={`prompt-workbench ${promptCollapsed ? "collapsed" : ""}`}
          >
            <header>
              <div>
                <small>STRUCTURED SD PROMPT</small>
                <b>场景先行提示词</b>
              </div>
              <div className="prompt-workbench-actions">
                <button onClick={() => setPromptCollapsed((value) => !value)}>
                  {promptCollapsed ? "展开编辑" : "折叠"}
                </button>
                <button
                  className="primary"
                  onClick={() => {
                    if (
                      shot.generationWidth * shot.generationHeight > 512 * 768 &&
                      !confirm("当前尺寸在 CPU 上可能耗时很长，确定继续吗？")
                    )
                      return;
                    quality.valid ? generateEditedPrompt() : repairAndGenerate();
                  }}
                  disabled={busy || shot.locked}
                >
                  {busy ? (
                    <LoaderCircle className="spin" size={15} />
                  ) : (
                    <WandSparkles size={15} />
                  )}{" "}
                  {busy
                    ? `生成中 ${generationProgress?.progress ?? 0}%`
                    : shot.locked
                      ? "已锁定"
                      : quality.valid
                        ? "生成构图草稿"
                        : "自动修正并生成草稿"}
                </button>
              </div>
            </header>
            {!promptCollapsed && (
              <>
                <details><summary>当前画面事实与姿态编译预览</summary>
                  <p><small>{executionPromptPreview.prompt || executionPromptPreview.errors.join('；')}</small></p>
                </details>
                <div className={`prompt-workbench-grid ${shot.characterIds.length > 1 ? "regional" : ""}`}>
                  {shot.characterIds.length > 1 ? (
                    <>
                      <label className="common-prompt">
                        公共场景与互动
                        <textarea
                          value={editableCommon}
                          onChange={(event) => setEditableCommon(event.target.value)}
                        />
                      </label>
                      {editableRegions.map((value, index) => (
                        <label key={shot.characterIds[index] || index}>
                          {index === 0 ? "左侧人物" : index === 1 ? "右侧人物" : `人物 ${index + 1}`}
                          <textarea
                            value={value}
                            onChange={(event) =>
                              setEditableRegions((current) =>
                                current.map((item, itemIndex) =>
                                  itemIndex === index ? event.target.value : item,
                                ),
                              )
                            }
                          />
                          {regionalCompiled.characterRegions[index]?.assetWarnings.map((warning) => (
                            <em className="asset-warning" key={warning}>{warning}</em>
                          ))}
                        </label>
                      ))}
                    </>
                  ) : (
                    <label>
                      正向提示词
                      <textarea
                        value={editablePositive}
                        onChange={(event) => setEditablePositive(event.target.value)}
                      />
                    </label>
                  )}
                  <label>
                    负向提示词
                    <textarea
                      value={editableNegative}
                      onChange={(event) =>
                        setEditableNegative(event.target.value)
                      }
                    />
                  </label>
                </div>
                {shot.poseControlEnabled!==false&&actionContractPoseUnavailable&&<p className="asset-warning">当前动作关系没有有效构图，不能降级使用旧骨架。请调整景别、人物区域或目标位置。</p>}
                <label className="pose-usage-toggle">
                  <input type="checkbox" checked={shot.poseControlEnabled !== false}
                    onChange={event => void mutate("updateShot", {shotId:shot.id,patch:{poseControlEnabled:event.target.checked}})} />
                  启用现有骨架控制
                  <small>{shot.poseControlEnabled === false ? "骨架已保留但不用于生成；关联的道具轮廓、骨架定位精修和裁切也停用。保留人物参考，动作由提示词表达。" : "使用现有骨架及参数约束动作。关闭后可随时重新启用。"}</small>
                </label>
                {effectivePoseControl && (
                  <section className="pose-control-card">
                    <div>
                      <b>{poseDisplay?.kindLabel} OpenPose</b>
                      <span>{poseDisplay?.sourceLabel} · {poseDisplay?.framingLabel} · {poseDisplay?.selectorReason}。{automaticPoseControlV3 ? "V3 会保留完整动作，再统一投影为实际控制图。" : "可直接拖动当前骨骼关节点，应用后作为本格实际 ControlNet 姿势图。"}</span>
                      {(automaticPoseControlV2 || automaticPoseControlV3) && (
                        <div className="pose-template-controls">
                          <div className="pose-recommendation">
                            <span>{automaticPoseControlV3 ? "V3" : "V2"} 当前计划{poseControlOverride ? "（人工覆盖）" : "（自动推荐）"}：{effectivePoseControl.scenePlan.people.map((person) => person.actions.join(" + ")).join(" / ")}</span>
                            <span>置信度 {effectivePoseControl.scenePlan.confidence} · 变体 {effectivePoseControl.variantId + 1} · {effectivePoseControl.controlProfile.id}（{effectivePoseControl.controlProfile.weight}/{effectivePoseControl.controlProfile.guidanceEnd}）</span>
                            {automaticPoseControlV3 && <span>自动构图：{automaticPoseControlV3.scenePlan.projection?.composition || "需要调整"} · {automaticPoseControlV3.scenePlan.decisionReasons.join("；")}</span>}
                            {effectiveLocomotion && <span>步态：{effectiveLocomotion.mode === "run" ? "跑动" : "行走"} · {effectiveLocomotion.gaitPhase === "heel_strike" ? "落脚接触" : effectiveLocomotion.gaitPhase === "mid_stance" ? "中支撑" : "蹬地摆动"} · 支撑脚 {effectiveLocomotion.supportSide === "left" ? "左" : "右"} · 摆动脚 {effectiveLocomotion.swingSide === "left" ? "左" : "右"}</span>}
                            {effectivePoseControl.posePlanVersion === "3.0" && <span>当前显示叠加后的实际姿态：{effectivePoseControl.scenePlan.people.map(p=>[availablePosePresets.find(t=>t.id===p.layers?.bodyTemplateId)?.label||p.basePose,p.templateId!==p.layers?.bodyTemplateId&&p.templateId!==p.layers?.armTemplateId?availablePosePresets.find(t=>t.id===p.templateId)?.label:null,availablePosePresets.find(t=>t.id===p.layers?.armTemplateId)?.label,p.relationTargets.length?"保留固定剧情接触目标（镜像后仍需可达）":""].filter(Boolean).join(" + ")).join(" / ")}</span>}
                            {effectivePoseControl.posePlanVersion === "3.0" && !effectivePoseControl.safety.valid && [...new Set(effectivePoseControl.safety.errors.map(overlayFailureTextV3))].map((error,i)=><em className="asset-warning" key={"pose-error-"+i}>{error}</em>)}
                            {effectivePoseControl.posePlanVersion === "3.0" && poseOverlayBindingFailuresV3(effectivePoseControl.scenePlan.people).length>0 && <em className="asset-warning">当前道具动作仅用于骨架预览；生成前需要绑定剧情道具与接触点。</em>}
                            {effectivePoseControl.framingWarnings.map((warning) => <em className="asset-warning" key={warning}>{warning}</em>)}
                          </div>
                          <label>
                            动作模板
                            <select
                              value={poseControlOverride?.templateId || effectivePoseControl.presetId}
                              onChange={(event) => updatePoseParameters({ templateId: event.target.value })}
                            >
                              {[...new Set(availablePosePresets.map((preset) => preset.category))].map((category) => (
                                <optgroup key={category} label={category}>
                                  {availablePosePresets.filter((preset) => preset.category === category).map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
                                </optgroup>
                              ))}
                            </select>
                          </label>
                          {effectivePoseControl.scenePlan.visualSpecConfirmed && (
                            <label>
                              <input
                                type="checkbox"
                                checked={Boolean(poseControlOverride?.confirmPoseContract)}
                                onChange={(event) => updatePoseParameters({ confirmPoseContract: event.target.checked })}
                              />
                              确认覆盖已确认剧情姿态
                            </label>
                          )}
                          {effectivePoseControl.posePlanVersion === "3.0" && effectivePoseControl.people.length===1 && <label>手部叠加<select value={effectivePoseControl.scenePlan.people[0]?.layers?.armTemplateId||"none"} onChange={(event)=>updatePoseParameters({armTemplateId:event.target.value as PoseControlOverrideV1["armTemplateId"]})}><option value="none">无额外手部动作</option><option value="hold_one">单手持物</option><option value="hold_two">双手持物</option><option value="phone_one">单手看手机</option><option value="phone_two">双手看手机</option></select></label>}
                          {effectivePoseControl.posePlanVersion==="3.0" && effectivePoseControl.scenePlan.people[0]?.actionRelationAudit && <details><summary>动作关系（剧情自动推导，可调整）</summary>
                            <label>动作机制<select value={poseControlOverride?.actionGeometry?.mechanism||effectiveActionGeometry?.mechanism||""} onChange={event=>updatePoseParameters({actionGeometry:{...poseControlOverride?.actionGeometry,mechanism:event.target.value as NonNullable<PoseControlOverrideV1["actionGeometry"]>["mechanism"]}})}><option value="">待确定</option><option value="hinge">铰链开合</option><option value="slide">滑动</option><option value="press">按压</option><option value="rotate">旋转</option><option value="work">工具接触工作面</option><option value="mouth">杯沿／食物接近口部</option><option value="transfer">从支持面拿取／放置</option><option value="force">推拉施力</option></select></label>
                            {(["objectCenter","axis","workPoint","toolEnd","mouthContact"] as const).map(key=><label key={key}>{({objectCenter:"物体目标位置",axis:"运动／施力方向",workPoint:"工作面接触点",toolEnd:"工具作用端",mouthContact:"杯沿／食物作用端"})[key]} {(["x","y"] as const).map(coordinate=><input key={coordinate} type="number" aria-label={key+" "+coordinate} placeholder={coordinate} step="0.01" value={poseControlOverride?.actionGeometry?.[key]?.[coordinate]??effectiveActionGeometry?.[key]?.[coordinate]??""} onChange={event=>{const previous=poseControlOverride?.actionGeometry?.[key]||effectiveActionGeometry?.[key];updatePoseParameters({actionGeometry:{...poseControlOverride?.actionGeometry,[key]:{x:previous?.x??0,y:previous?.y??0,[coordinate]:Number(event.target.value)}}});}}/>)}</label>)}
                            <label>支持面高度<input type="number" min="0" max="1" step="0.01" value={poseControlOverride?.actionGeometry?.supportY??effectiveActionGeometry?.supportY??""} onChange={event=>updatePoseParameters({actionGeometry:{...poseControlOverride?.actionGeometry,supportY:event.target.value?Number(event.target.value):undefined}})}/></label>
                            {effectiveActionGeometry?.modelVersion&&<small>已根据动作与对象建立关系。尺寸、转角和行程采用代表值，可按场景调整。</small>}
                            {['hinge','rotate'].includes(effectiveActionGeometry?.mechanism||'')&&<label>转角（弧度）<input type="number" step="0.1" min="-3.14" max="3.14" value={poseControlOverride?.actionGeometry?.angle??effectiveActionGeometry?.angle??1} onChange={event=>updatePoseParameters({actionGeometry:{...poseControlOverride?.actionGeometry,angle:Number(event.target.value)}})}/></label>}
                            {['slide','press'].includes(effectiveActionGeometry?.mechanism||'')&&<label>移动行程<input type="number" step="0.01" min="0" max="0.3" value={poseControlOverride?.actionGeometry?.travel??effectiveActionGeometry?.travel??0} onChange={event=>updatePoseParameters({actionGeometry:{...poseControlOverride?.actionGeometry,travel:Number(event.target.value)}})}/></label>}
                            <small>无需逐项填写。高级位置调整使用完整骨架坐标，通常为0～1；方向为向量。</small>
                          </details>}
                          <label>骨架约束<select value={poseControlOverride?.conditioning?.strength || "auto"} onChange={event=>updatePoseParameters({conditioning:{strength:event.target.value as "auto"|"flexible"|"strict"}})}><option value="auto">自动：按剧情接触调整</option><option value="flexible">灵活：给模型更多调整空间</option><option value="strict">严格：优先遵循骨架</option></select></label>
                          <label>OpenPose 权重 {effectivePoseControl.controlProfile.weight.toFixed(2)}<input type="range" min="0" max="2" step="0.01" value={effectivePoseControl.controlProfile.weight} onChange={event=>updatePoseParameters({conditioning:{...poseControlOverride?.conditioning,weight:Number(event.target.value)}})}/></label>
                          <label>控制至采样进度 {Math.round(effectivePoseControl.controlProfile.guidanceEnd*100)}%<input type="range" min="0" max="1" step="0.01" value={effectivePoseControl.controlProfile.guidanceEnd} onChange={event=>updatePoseParameters({conditioning:{...poseControlOverride?.conditioning,guidanceEnd:Number(event.target.value)}})}/></label>
                          <label>
                            动作阶段
                            <select value={poseControlOverride?.phase || effectivePoseControl.scenePlan.people[0]?.phase || "contact"} onChange={(event) => updatePoseParameters({ phase: event.target.value as PoseControlOverrideV1["phase"] })}>
                              <option value="anticipation">{effectiveLocomotion ? "落脚／接触" : "准备"}</option>
                              <option value="contact">{effectiveLocomotion ? "中支撑" : "接触／动作中"}</option>
                              <option value="follow_through">{effectiveLocomotion ? "蹬地／摆动" : "完成／随动"}</option>
                            </select>
                          </label>
                          <label>
                            力度
                            <select value={poseControlOverride?.intensity || effectivePoseControl.scenePlan.people[0]?.intensity || "normal"} onChange={(event) => updatePoseParameters({ intensity: event.target.value as PoseControlOverrideV1["intensity"] })}>
                              <option value="calm">轻微</option>
                              <option value="normal">正常</option>
                              <option value="dynamic">强动态</option>
                            </select>
                          </label>
                          <label>
                            主动手
                            <select value={effectivePoseControl.scenePlan.people[0]?.handedness || "right"} onChange={(event) => updatePoseParameters({ handedness: event.target.value as PoseControlOverrideV1["handedness"] })}>
                              <option value="left">左手</option>
                              <option value="right">右手</option>
                              <option value="both">双手</option>
                            </select>
                          </label>
                          <label>
                            目标方向
                            <select value={poseControlOverride?.targetDirection || "center"} onChange={(event) => updatePoseParameters({ targetDirection: event.target.value as PoseControlOverrideV1["targetDirection"] })}>
                              <option value="left">左侧</option>
                              <option value="center">中央</option>
                              <option value="right">右侧</option>
                              <option value="up">上方</option>
                              <option value="down">下方</option>
                            </select>
                          </label>
                          {effectivePoseControl.posePlanVersion === "3.0" && effectivePoseControl.scenePlan.people[0]?.basicGeometry && (<>
                            <label>身体朝向<select value={effectivePoseControl.scenePlan.people[0].basicGeometry.parameters.view} onChange={(event) => updatePoseParameters({bodyView:event.target.value as PoseControlOverrideV1["bodyView"]})}><option value="front">正面</option><option value="three_quarter">斜侧面</option><option value="left_profile">左侧面</option><option value="right_profile">右侧面</option></select></label>
                            {effectivePoseControl.scenePlan.people[0].basicGeometry.parameters.templateId === "sit" && <label>坐姿腿距<select value={effectivePoseControl.scenePlan.people[0].basicGeometry.parameters.kneeSpacing} onChange={(event) => updatePoseParameters({kneeSpacing:event.target.value as PoseControlOverrideV1["kneeSpacing"]})}><option value="natural">自然</option><option value="together">并膝</option><option value="apart">分腿</option></select></label>}
                          </>)}
                          {effectivePoseControl.people.length === 2 && (
                            <label>
                              人物间距
                              <select value={poseControlOverride?.spacing || "normal"} onChange={(event) => updatePoseParameters({ spacing: event.target.value as PoseControlOverrideV1["spacing"] })}>
                                <option value="close">靠近</option>
                                <option value="normal">正常</option>
                                <option value="wide">拉开</option>
                              </select>
                            </label>
                          )}
                          <button type="button" onClick={() => updatePoseParameters({ mirror: !(poseControlOverride?.mirror ?? effectivePoseControl.scenePlan.people[0]?.mirror) })}>身体镜像</button>
                          {effectivePoseControl.posePlanVersion==='3.0'&&effectivePoseControl.scenePlan.people.some(p=>p.loadSupport)&&<small>{effectivePoseControl.scenePlan.people.map(p=>`${characters.find(c=>c.id===p.characterId)?.name||'人物'}：${p.pairRole==='active'?'支撑者':'受支撑者'}`).join('；')}</small>}
                          {effectivePoseControl.people.length === 2 && <button type="button" onClick={() => updatePoseParameters({ swapRoles: !poseControlOverride?.swapRoles })}>交换动作角色</button>}
                        </div>
                      )}
                      <div>
                        <button type="button" className="pose-edit-primary" onClick={openCurrentPoseEditor}>直接编辑当前骨骼</button>
                        <button type="button" onClick={openOpenPoseEditor}>打开外部 3D 编辑器</button>
                        <label className="pose-upload">
                          上传调整后的姿势图
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              if (!file) return;
                              const reader = new FileReader();
                              reader.onload = () => {
                                setPoseControlOverride(null);
                                setPoseImageOverride(String(reader.result || ""));
                              };
                              reader.readAsDataURL(file);
                            }}
                          />
                        </label>
                        {(poseImageOverride || poseControlOverride) && <button type="button" onClick={restoreAutomaticPose}>恢复自动推荐</button>}
                      </div>
                    </div>
                    {posePreview && <aside className="pose-preview-panel">
                      {fullPreviewSvg && !poseImageOverride && <><div><button type="button" aria-pressed={posePreviewMode==="full"} onClick={()=>setPosePreviewMode("full")}>完整骨架</button><button type="button" aria-pressed={posePreviewMode==="control"} onClick={()=>setPosePreviewMode("control")}>实际控制图</button></div><p>{posePreviewMode==="full"?"完整骨架 · 白色虚线为取景框，灰色为物品轮廓／中心，白色圆环为抓取目标，短虚线为手腕到目标的间隔。":"实际控制图 · 仅显示当前镜头范围内的关节。"}</p></>}
                      <img src={posePreview} alt={posePreviewMode==="full"&&fullPreviewSvg&&!poseImageOverride?"完整骨架与实际取景框":"当前 OpenPose 骨骼预览"} />
                    </aside>}
                    {poseEditorOpen && effectivePoseControl && (
                      <div className="pose-editor-backdrop" role="presentation" onPointerDown={(event) => {
                        if (event.target === event.currentTarget) setPoseEditorOpen(false);
                      }}>
                        <section className="pose-editor-dialog" role="dialog" aria-modal="true" aria-label="OpenPose 骨骼编辑器">
                          <header>
                            <div>
                              <b>编辑当前{editablePosePeople.length>1?"多人":"单人"}骨骼</b>
                              <span>{poseEditorLayout?"完整骨架编辑：虚线为实际取景框，应用后保持镜头不变。":"拖动彩色关节点，连线会实时跟随；应用后只覆盖本格姿态。"}</span>
                            </div>
                            <button type="button" onClick={() => setPoseEditorOpen(false)}>关闭</button>
                          </header>
                          <svg
                            className="pose-editor-canvas"
                            style={{aspectRatio:`${effectivePoseControl.width} / ${effectivePoseControl.height}`}}
                            viewBox={`0 0 ${effectivePoseControl.width} ${effectivePoseControl.height}`}
                            onPointerMove={movePosePoint}
                            onPointerUp={() => setDraggingPosePoint(null)}
                            onPointerCancel={() => setDraggingPosePoint(null)}
                          >
                            <rect width={effectivePoseControl.width} height={effectivePoseControl.height} fill="#000" />
                            {poseEditorLayout?.frame && <rect x={poseEditorLayout.frame.x*effectivePoseControl.width} y={poseEditorLayout.frame.y*effectivePoseControl.height} width={poseEditorLayout.frame.width*effectivePoseControl.width} height={poseEditorLayout.frame.height*effectivePoseControl.height} fill="none" stroke="#fff" strokeDasharray="8 6" pointerEvents="none" />}
                            {editablePosePeople.map((person, personIndex) => (
                              <g key={`person-${personIndex}`}>
                                {poseEditorLimbs.filter(([start,end]) => [person[start], person[end]].every((point) => point && point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1)).map(([start, end], limbIndex) => (
                                  <line
                                    key={`limb-${personIndex}-${start}-${end}`}
                                    x1={person[start].x * effectivePoseControl.width}
                                    y1={person[start].y * effectivePoseControl.height}
                                    x2={person[end].x * effectivePoseControl.width}
                                    y2={person[end].y * effectivePoseControl.height}
                                    stroke={poseEditorColors[limbIndex]}
                                    strokeWidth="5"
                                    strokeLinecap="round"
                                    pointerEvents="none"
                                  />
                                ))}
                                {person.map((point, pointIndex) => point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1 ? (
                                  <circle
                                    key={`point-${personIndex}-${pointIndex}`}
                                    cx={point.x * effectivePoseControl.width}
                                    cy={point.y * effectivePoseControl.height}
                                    r="8"
                                    fill={poseEditorColors[pointIndex % poseEditorColors.length]}
                                    stroke="#fff"
                                    strokeWidth="2"
                                    onPointerDown={(event) => {
                                      event.preventDefault();
                                      event.currentTarget.setPointerCapture(event.pointerId);
                                      setDraggingPosePoint({ personIndex, pointIndex });
                                    }}
                                  />
                                ) : null)}
                              </g>
                            ))}
                          </svg>
                          <footer>
                            <button type="button" onClick={restoreSelectedTemplate}>恢复当前模板</button>
                            <button type="button" onClick={() => setPoseEditorOpen(false)}>取消</button>
                            <button type="button" className="pose-editor-apply" disabled={poseEditorSaving||!editablePosePeople.length} onClick={applyEditedPose}>{poseEditorSaving ? "正在应用…" : "应用到本格"}</button>
                          </footer>
                        </section>
                      </div>
                    )}
                  </section>
                )}
                <footer>
                  <button
                    onClick={() => {
                      setEditablePositive(positive);
                      setEditableNegative(
                        shot.characterIds.length > 1
                          ? regionalCompiled.negativePrompt
                          : negativePrompt,
                      );
                      setEditableCommon(regionalCompiled.commonPrompt);
                      setEditableRegions(regionalCompiled.regionPrompts);
                      setPoseImageOverride("");
                    }}
                  >
                    恢复系统版本
                  </button>
                  <button onClick={copyPrompt}>
                    {copied ? "已复制" : "复制提示词"}
                  </button>
                </footer>
              </>
            )}
          </section>
        </section>
        <aside className="inspector">
          <div className="inspector-head">
            <b>画面设定</b>
            <span>自动保存</span>
          </div>
          <div className="inspector-tabs">
            <button
              className={inspectorTab === "story" ? "active" : ""}
              onClick={() => setInspectorTab("story")}
            >
              分镜
            </button>
            <button
              className={inspectorTab === "characters" ? "active" : ""}
              onClick={() => setInspectorTab("characters")}
            >
              人物造型
            </button>
            <button
              className={inspectorTab === "environment" ? "active" : ""}
              onClick={() => setInspectorTab("environment")}
            >
              画面环境 <i>{quality.environmentScore}</i>
            </button>
          </div>
          <div className="inspector-scroll">
            <section
              className={`prompt-quality compact ${quality.valid ? "valid" : "invalid"}`}
            >
              <header>
                <b>提示词检查</b>
                <span>
                  {quality.valid ? "可生成" : `${quality.errors.length} 项风险`}
                </span>
              </header>
              <p>
                环境完整度 {quality.environmentScore}% ·{" "}
                {quality.environmentChecks.join(" / ")}
              </p>
            </section>
            {inspectorTab === "story" && (
              <>
                <Field
                  label="镜头标题"
                  value={shot.title}
                  change={(value) => patch(shot.id, { title: value })}
                />
                <Field
                  label="剧情说明（用于视觉规划）"
                  textarea
                  value={shot.description}
                  change={(value) => patch(shot.id, { description: value })}
                />
                <div className="field-pair">
                  <Field
                    label="景别"
                    value={shot.camera}
                    change={(value) => patch(shot.id, { camera: value })}
                  />
                  <Field
                    label="时间"
                    value={shot.timeOfDay}
                    change={(value) => patch(shot.id, { timeOfDay: value })}
                  />
                </div>
                <Field
                  label="对白（独立图层）"
                  textarea
                  value={shot.dialogue}
                  change={(value) => patch(shot.id, { dialogue: value })}
                />
                <label className="field">
                  <span>生成尺寸</span>
                  <select
                    value={`${shot.generationWidth}x${shot.generationHeight}`}
                    onChange={(event) => {
                      const [width, height] = event.target.value
                        .split("x")
                        .map(Number);
                      patch(shot.id, {
                        generationWidth: width,
                        generationHeight: height,
                      });
                    }}
                  >
                    <option value="512x512">512 × 512（默认）</option>
                    <option value="512x768">512 × 768（竖图）</option>
                    <option value="768x512">768 × 512（横图）</option>
                    <option
                      value={`${shot.generationWidth}x${shot.generationHeight}`}
                    >
                      自定义当前值
                    </option>
                  </select>
                </label>
                <div className="field-pair">
                  <label className="field">
                    <span>自定义宽度（64倍数）</span>
                    <input
                      value={customSize.width}
                      onChange={(event) =>
                        setCustomSize((size) => ({
                          ...size,
                          width: event.target.value,
                        }))
                      }
                      onBlur={() =>
                        patch(shot.id, {
                          generationWidth: Number(customSize.width),
                        })
                      }
                    />
                  </label>
                  <label className="field">
                    <span>自定义高度（64倍数）</span>
                    <input
                      value={customSize.height}
                      onChange={(event) =>
                        setCustomSize((size) => ({
                          ...size,
                          height: event.target.value,
                        }))
                      }
                      onBlur={() =>
                        patch(shot.id, {
                          generationHeight: Number(customSize.height),
                        })
                      }
                    />
                  </label>
                </div>
                {shot.generationWidth * shot.generationHeight > 512 * 768 && (
                  <p className="cpu-size-warning">
                    该尺寸在 CPU 上会明显增加生成时间，提交前会再次确认。
                  </p>
                )}
              </>
            )}
            {inspectorTab === "characters" && (
              <>
                <label className="field">
                  <span>
                    <UserRound size={14} /> 本格出场人物
                  </span>
                  <div className="character-picker">
                    {characters.filter((character) => isDisplayableCharacterName(character.name)).map((character) => (
                      <label key={character.id}>
                        <input
                          type="checkbox"
                          checked={shot.characterIds.includes(character.id)}
                          onChange={(event) => {
                            const next = event.target.checked
                              ? [
                                  ...new Set([
                                    ...shot.characterIds,
                                    character.id,
                                  ]),
                                ]
                              : shot.characterIds.filter(
                                  (id) => id !== character.id,
                                );
                            if (next.length) {
                              patch(shot.id, { characterIds: next });
                              setActiveCharacterId(next[0]);
                            }
                          }}
                        />
                        <b>{character.name}</b>
                        <small>
                          {character.status === "ready"
                            ? "已启用"
                            : "缺少基准资产"}
                        </small>
                      </label>
                    ))}
                  </div>
                </label>
                <div className="character-look-tabs">
                  {shot.characterIds.map((id) => {
                    const character = characters.find((item) => item.id === id);
                    return (
                      <button
                        className={activeCharacterId === id ? "active" : ""}
                        onClick={() => setActiveCharacterId(id)}
                        key={id}
                      >
                        {character?.name || id}
                      </button>
                    );
                  })}
                </div>
                {characterLooks[activeCharacterId] && (
                  <>
                    <label className="field">
                      <span>服装</span>
                      <select
                        value={characterLooks[activeCharacterId].outfitId}
                        onChange={(event) =>
                          patchLook("outfitId", event.target.value)
                        }
                      >
                        <option value="">人物档案文字兜底</option>
                        {outfits
                          .filter(
                            (asset) => asset.characterId === activeCharacterId,
                          )
                          .map((asset) => (
                            <option value={asset.id} key={asset.id}>
                              {asset.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>鞋履</span>
                      <select
                        value={characterLooks[activeCharacterId].shoeId}
                        onChange={(event) =>
                          patchLook("shoeId", event.target.value)
                        }
                      >
                        <option value="">人物档案文字兜底</option>
                        {shoes
                          .filter(
                            (asset) => asset.characterId === activeCharacterId,
                          )
                          .map((asset) => (
                            <option value={asset.id} key={asset.id}>
                              {asset.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    <Field
                      label="发色（英文）"
                      value={characterLooks[activeCharacterId].hairColorEn}
                      change={(value) => patchLook("hairColorEn", value)}
                    />
                    <Field
                      label="发型（英文）"
                      value={characterLooks[activeCharacterId].hairStyleEn}
                      change={(value) => patchLook("hairStyleEn", value)}
                    />
                    <Field
                      label="瞳色（英文）"
                      value={characterLooks[activeCharacterId].eyeColorEn}
                      change={(value) => patchLook("eyeColorEn", value)}
                    />
                    <Field
                      label="画面位置（英文）"
                      value={characterLooks[activeCharacterId].positionEn}
                      change={(value) => patchLook("positionEn", value)}
                    />
                    <Field
                      label="单一动作（英文）"
                      textarea
                      value={characterLooks[activeCharacterId].actionEn}
                      change={(value) => patchLook("actionEn", value)}
                    />
                    <Field
                      label="表情（英文）"
                      value={characterLooks[activeCharacterId].expressionEn}
                      change={(value) => patchLook("expressionEn", value)}
                    />
                    <Field
                      label="视线目标（英文）"
                      value={characterLooks[activeCharacterId].gazeEn}
                      change={(value) => patchLook("gazeEn", value)}
                    />
                    <Field
                      label="手部状态（英文）"
                      value={characterLooks[activeCharacterId].handsEn}
                      change={(value) => patchLook("handsEn", value)}
                    />
                  </>
                )}
              </>
            )}
            {inspectorTab === "environment" && (
              <>
                <Field
                  label="地点类型（英文）"
                  value={environment.locationType}
                  change={(value) => patchEnvironment("locationType", value)}
                />
                <Field
                  label="具体地点（英文）"
                  textarea
                  value={environment.location}
                  change={(value) => patchEnvironment("location", value)}
                />
                <Field
                  label="前景物件（英文）"
                  value={environment.foreground}
                  change={(value) => patchEnvironment("foreground", value)}
                />
                <Field
                  label="中景物件（英文）"
                  value={environment.midground}
                  change={(value) => patchEnvironment("midground", value)}
                />
                <Field
                  label="背景与建筑（英文）"
                  textarea
                  value={environment.background}
                  change={(value) => patchEnvironment("background", value)}
                />
                <Field
                  label="空间纵深（英文）"
                  value={environment.depth}
                  change={(value) => patchEnvironment("depth", value)}
                />
                <Field
                  label="天气（英文）"
                  value={environment.weather}
                  change={(value) => patchEnvironment("weather", value)}
                />
                <Field
                  label="时间视觉（英文）"
                  textarea
                  value={environment.timeVisual}
                  change={(value) => patchEnvironment("timeVisual", value)}
                />
                <Field
                  label="主光源（英文）"
                  value={environment.keyLight}
                  change={(value) => patchEnvironment("keyLight", value)}
                />
                <Field
                  label="环境光（英文）"
                  value={environment.ambientLight}
                  change={(value) => patchEnvironment("ambientLight", value)}
                />
                <Field
                  label="色温（英文）"
                  value={environment.colorTemperature}
                  change={(value) =>
                    patchEnvironment("colorTemperature", value)
                  }
                />
                <Field
                  label="气氛（英文）"
                  textarea
                  value={environment.atmosphere}
                  change={(value) => patchEnvironment("atmosphere", value)}
                />
                <label className="field">
                  <span>环境强调</span>
                  <select
                    value={environment.emphasis}
                    onChange={(event) =>
                      patchEnvironment("emphasis", event.target.value)
                    }
                  >
                    <option value="low">低（特写友好）</option>
                    <option value="balanced">平衡</option>
                    <option value="high">高（突出场景）</option>
                  </select>
                </label>
              </>
            )}
            <div className="quick-mods">
              <button onClick={() => openQuick("expression")}>只改表情</button>
              <button onClick={() => openQuick("action")}>只改动作</button>
              <button onClick={() => openQuick("camera")}>更换镜头</button>
              <button onClick={() => openQuick("outfit")}>更换服装</button>
            </div>
          </div>
          <div hidden>
            <section
              className={`prompt-quality ${quality.valid ? "valid" : "invalid"}`}
            >
              <header>
                <b>提示词质量检查</b>
                <span>
                  {quality.valid ? "可生成草稿" : "有风险，可选择处理方式"}
                </span>
              </header>
              <dl>
                <dt>人数</dt>
                <dd>
                  {quality.characterCount} 人 · {quality.countRule}
                </dd>
                <dt>动作</dt>
                <dd>{quality.action || "未填写"}</dd>
                <dt>表情</dt>
                <dd>{quality.expression || "未填写"}</dd>
                <dt>视线</dt>
                <dd>{quality.gaze}</dd>
                <dt>手部</dt>
                <dd>{quality.hands}</dd>
                <dt>镜头</dt>
                <dd>{quality.camera || "未填写"}</dd>
              </dl>
              {quality.errors.map((error) => (
                <p className="error" key={error}>
                  {error}
                </p>
              ))}
              {quality.warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
              <div className="prompt-quality-actions">
                {!quality.valid && (
                  <button className="primary" onClick={repairAndGenerate}>
                    自动修正并生成草稿
                  </button>
                )}
                <button onClick={generateEditedPrompt}>
                  使用下方编辑提示词生成
                </button>
                {!quality.valid && (
                  <button onClick={generateIgnoringWarnings}>
                    忽略建议，仍然生成
                  </button>
                )}
              </div>
            </section>
            <Field
              label="镜头标题"
              value={shot.title}
              change={(v) => patch(shot.id, { title: v })}
            />
            <Field
              label="剧情说明（用于视觉规划）"
              textarea
              value={shot.description}
              change={(v) => patch(shot.id, { description: v })}
            />
            <div className="field-pair">
              <Field
                label="景别（中文备注）"
                value={shot.camera}
                change={(v) => patch(shot.id, { camera: v })}
              />
              <Field
                label="时间"
                value={shot.timeOfDay}
                change={(v) => patch(shot.id, { timeOfDay: v })}
              />
            </div>
            <Field
              label="场景（中文备注）"
              value={shot.scene}
              change={(v) => patch(shot.id, { scene: v })}
            />
            <label className="field">
              <span>
                <UserRound size={14} /> 本格出场人物
              </span>
              <div className="character-picker">
                {characters.filter((character) => isDisplayableCharacterName(character.name)).map((character) => (
                  <label key={character.id}>
                    <input
                      type="checkbox"
                      checked={shot.characterIds.includes(character.id)}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? [...new Set([...shot.characterIds, character.id])]
                          : shot.characterIds.filter(
                              (id) => id !== character.id,
                            );
                        if (next.length) patch(shot.id, { characterIds: next });
                      }}
                    />
                    <b>{character.name}</b>
                    <small>
                      {character.status === "ready" ? "已启用" : "缺少基准资产"}
                    </small>
                  </label>
                ))}
              </div>
            </label>
            <div className="asset-preview">
              {[
                ...assets.filter(
                  (a) =>
                    a.type === "character" &&
                    shot.characterIds.includes(a.characterId),
                ),
                assets.find((a) => a.id === shot.outfitId),
                assets.find((a) => a.id === shot.shoeId),
              ]
                .filter(Boolean)
                .map((asset) => (
                  <button key={asset!.id} onClick={() => openQuick("outfit")}>
                    <img src={fileUrl(asset!.path)} alt={asset!.name} />
                    <span>
                      {asset!.name}
                      <small>{asset!.id}</small>
                    </span>
                  </button>
                ))}
            </div>
            <label className="field">
              <span>鞋履资产</span>
              <select
                value={shot.shoeId}
                onChange={(e) => patch(shot.id, { shoeId: e.target.value })}
              >
                {shoes.map((asset) => (
                  <option value={asset.id} key={asset.id}>
                    {asset.name} · {asset.id}
                  </option>
                ))}
              </select>
            </label>
            <Field
              label="对白（独立图层，不进入生图提示词）"
              textarea
              value={shot.dialogue}
              change={(v) => patch(shot.id, { dialogue: v })}
            />
            <Field
              label="英文动作（一个主动作，写明身体/手部）"
              textarea
              value={shot.actionEn}
              change={(v) => patch(shot.id, { actionEn: v })}
            />
            <Field
              label="英文表情与视线"
              textarea
              value={shot.expressionEn}
              change={(v) => patch(shot.id, { expressionEn: v })}
            />
            <Field
              label="英文场景"
              textarea
              value={shot.sceneEn}
              change={(v) => patch(shot.id, { sceneEn: v })}
            />
            <Field
              label="英文构图与人物位置"
              textarea
              value={shot.compositionEn}
              change={(v) => patch(shot.id, { compositionEn: v })}
            />
            <div className="quick-mods">
              <button onClick={() => openQuick("expression")}>只改表情</button>
              <button onClick={() => openQuick("action")}>只改动作</button>
              <button onClick={() => openQuick("camera")}>更换镜头</button>
              <button onClick={() => openQuick("outfit")}>更换服装</button>
            </div>
          </div>
        </aside>
      </div>
      {quick && (
        <div className="modal-backdrop" onClick={() => setQuick(null)}>
          <section
            className="quick-dialog"
            onClick={(e) => e.stopPropagation()}
          >
            <small>LOCAL CHANGE · 不覆盖旧候选</small>
            <h2>
              {quick === "expression"
                ? "只修改表情"
                : quick === "action"
                  ? "只修改动作"
                  : quick === "camera"
                    ? "更换镜头"
                    : "更换服装"}
            </h2>
            {quick === "outfit" ? (
              <>
                <div className="wardrobe-grid">
                  {outfits.map((asset) => (
                    <button
                      className={draft === asset.id ? "active" : ""}
                      onClick={() => setDraft(asset.id)}
                      key={asset.id}
                    >
                      <img src={fileUrl(asset.path)} alt={asset.name} />
                      <b>{asset.name}</b>
                      <span>{asset.visualDescriptionEn || asset.id}</span>
                    </button>
                  ))}
                </div>
                <label className="field">
                  <span>应用范围</span>
                  <select
                    value={applyScope}
                    onChange={(e) =>
                      setApplyScope(e.target.value as typeof applyScope)
                    }
                  >
                    <option value="shot">仅当前格</option>
                    <option value="page">当前页全部分格</option>
                    <option value="following">从本格到本章后续</option>
                  </select>
                </label>
              </>
            ) : quick === "camera" ? (
              <select value={draft} onChange={(e) => setDraft(e.target.value)}>
                <option value="extreme close-up">Extreme close-up</option>
                <option value="close-up">Close-up</option>
                <option value="medium shot">Medium shot</option>
                <option value="full shot">Full shot</option>
                <option value="wide shot">Wide shot</option>
                <option value="high-angle shot">High-angle shot</option>
                <option value="low-angle shot">Low-angle shot</option>
              </select>
            ) : (
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="English only"
              />
            )}
            <div className="diff-preview">
              <span>即将变更</span>
              <code>
                {quick}: {draft}
              </code>
              <small>
                确认后只保存修改；可以继续调整其他项目，完成后再单独生成草稿。
              </small>
            </div>
            <footer>
              <button onClick={() => setQuick(null)}>取消</button>
              <button
                className="primary"
                disabled={!draft || busy || /[\u3400-\u9fff]/.test(draft)}
                onClick={applyQuick}
              >
                确认修改
              </button>
            </footer>
          </section>
        </div>
      )}
    </>
  );
}

function Field({
  label,
  value,
  change,
  textarea = false,
  hidden = false,
}: {
  label: string;
  value: string;
  change: (v: string) => void;
  textarea?: boolean;
  hidden?: boolean;
}) {
  return (
    <label className="field" hidden={hidden}>
      <span>{label}</span>
      {textarea ? (
        <textarea value={value} onChange={(e) => change(e.target.value)} />
      ) : (
        <input value={value} onChange={(e) => change(e.target.value)} />
      )}
    </label>
  );
}

function LayoutEditor({
  data,
  pageRef,
  exportPage,
  mutate,
  busy,
}: {
  data: StudioData;
  pageRef: React.RefObject<HTMLDivElement | null>;
  exportPage: (f: "png" | "pdf") => void;
  mutate: (
    action: string,
    payload: Record<string, unknown>,
  ) => Promise<StudioData>;
  busy: boolean;
}) {
  const page = data.episode.pages[0];
  const ready = page.shots.every((s) => s.candidates.some((c) => c.selected));
  const [activeLayerId, setActiveLayerId] = useState<number | null>(
    page.textLayers[0]?.id ?? null,
  );
  const [draft, setDraft] = useState(false);
  const [cropShotId, setCropShotId] = useState<number | null>(
    page.shots[0]?.id ?? null,
  );
  const dragRef = useRef<{
    id: number;
    pointerId: number;
    startX: number;
    startY: number;
    x: number;
    y: number;
  } | null>(null);
  const layout = page.layoutConfig;
  const active = page.textLayers.find((layer) => layer.id === activeLayerId);
  const cropShot = page.shots.find((shot) => shot.id === cropShotId);
  const patchLayout = (patch: Partial<PageLayout>) =>
    mutate("updatePageLayout", { pageId: page.id, patch });
  const addLayer = async (type: TextLayerType) => {
    const result = await mutate("addTextLayer", {
      pageId: page.id,
      shotId: page.shots[0]?.id,
      type,
    });
    const added = result.episode.pages
      .find((p) => p.id === page.id)
      ?.textLayers.at(-1);
    setActiveLayerId(added?.id ?? null);
  };
  const patchLayer = (layerId: number, patch: Partial<TextLayer>) =>
    mutate("updateTextLayer", { layerId, patch });
  const startLayerDrag = (
    event: React.PointerEvent<HTMLButtonElement>,
    layer: TextLayer,
  ) => {
    if (layer.locked) return;
    dragRef.current = {
      id: layer.id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: layer.x,
      y: layer.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveLayer = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current,
      stage = pageRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !stage) return;
    const rect = stage.getBoundingClientRect();
    event.currentTarget.style.left = `${Math.min(100, Math.max(-20, drag.x + ((event.clientX - drag.startX) / rect.width) * 100))}%`;
    event.currentTarget.style.top = `${Math.min(100, Math.max(-20, drag.y + ((event.clientY - drag.startY) / rect.height) * 100))}%`;
  };
  const endLayerDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current,
      stage = pageRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !stage) return;
    const rect = stage.getBoundingClientRect();
    patchLayer(drag.id, {
      x: Math.min(
        100,
        Math.max(
          -20,
          drag.x + ((event.clientX - drag.startX) / rect.width) * 100,
        ),
      ),
      y: Math.min(
        100,
        Math.max(
          -20,
          drag.y + ((event.clientY - drag.startY) / rect.height) * 100,
        ),
      ),
    });
    dragRef.current = null;
  };
  useEffect(() => {
    const stage = pageRef.current;
    if (!stage) return;
    let dragging: {
      element: HTMLButtonElement;
      layer: TextLayer;
      pointerId: number;
      startX: number;
      startY: number;
      x: number;
      y: number;
      width: number;
      height: number;
      mode: "move" | "resize";
    } | null = null;
    const down = (event: PointerEvent) => {
      const element = (event.target as HTMLElement).closest<HTMLButtonElement>(
        ".text-layer",
      );
      if (!element) return;
      const index = Array.from(stage.querySelectorAll(".text-layer")).indexOf(
        element,
      );
      const layer = page.textLayers.filter((item) => !item.hidden)[index];
      if (!layer || layer.locked) return;
      const bounds = element.getBoundingClientRect();
      dragging = {
        element,
        layer,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        x: layer.x,
        y: layer.y,
        width: layer.width,
        height: layer.height,
        mode:
          event.clientX > bounds.right - 18 &&
          event.clientY > bounds.bottom - 18
            ? "resize"
            : "move",
      };
      element.setPointerCapture(event.pointerId);
    };
    const move = (event: PointerEvent) => {
      if (!dragging || dragging.pointerId !== event.pointerId) return;
      const rect = stage.getBoundingClientRect();
      if (dragging.mode === "resize") {
        dragging.element.style.width = `${Math.min(100, Math.max(5, dragging.width + ((event.clientX - dragging.startX) / rect.width) * 100))}%`;
        dragging.element.style.height = `${Math.min(100, Math.max(5, dragging.height + ((event.clientY - dragging.startY) / rect.height) * 100))}%`;
      } else {
        dragging.element.style.left = `${Math.min(100, Math.max(-20, dragging.x + ((event.clientX - dragging.startX) / rect.width) * 100))}%`;
        dragging.element.style.top = `${Math.min(100, Math.max(-20, dragging.y + ((event.clientY - dragging.startY) / rect.height) * 100))}%`;
      }
    };
    const up = (event: PointerEvent) => {
      if (!dragging || dragging.pointerId !== event.pointerId) return;
      const rect = stage.getBoundingClientRect();
      const patch =
        dragging.mode === "resize"
          ? {
              width: Math.min(
                100,
                Math.max(
                  5,
                  dragging.width +
                    ((event.clientX - dragging.startX) / rect.width) * 100,
                ),
              ),
              height: Math.min(
                100,
                Math.max(
                  5,
                  dragging.height +
                    ((event.clientY - dragging.startY) / rect.height) * 100,
                ),
              ),
            }
          : {
              x: Math.min(
                100,
                Math.max(
                  -20,
                  dragging.x +
                    ((event.clientX - dragging.startX) / rect.width) * 100,
                ),
              ),
              y: Math.min(
                100,
                Math.max(
                  -20,
                  dragging.y +
                    ((event.clientY - dragging.startY) / rect.height) * 100,
                ),
              ),
            };
      void patchLayer(dragging.layer.id, patch);
      dragging = null;
    };
    stage.addEventListener("pointerdown", down);
    stage.addEventListener("pointermove", move);
    stage.addEventListener("pointerup", up);
    return () => {
      stage.removeEventListener("pointerdown", down);
      stage.removeEventListener("pointermove", move);
      stage.removeEventListener("pointerup", up);
    };
  }, [page.id, page.textLayers, pageRef]);
  useEffect(() => {
    const stage = pageRef.current;
    if (!stage) return;
    const cells = Array.from(
      stage.querySelectorAll<HTMLElement>(".comic-cell"),
    );
    cells.forEach((cell, index) => {
      const shot = page.shots[index];
      if (shot) {
        cell.style.gridColumn = `span ${shot.layoutColSpan || 1}`;
        cell.style.gridRow = `span ${shot.layoutRowSpan || 1}`;
      }
    });
    let drag: {
      index: number;
      shot: Shot;
      startX: number;
      startY: number;
      resize: boolean;
    } | null = null;
    const down = (event: PointerEvent) => {
      const cell = (event.target as HTMLElement).closest<HTMLElement>(
        ".comic-cell",
      );
      if (!cell) return;
      const index = cells.indexOf(cell);
      if (index < 0) return;
      const rect = cell.getBoundingClientRect();
      drag = {
        index,
        shot: page.shots[index],
        startX: event.clientX,
        startY: event.clientY,
        resize:
          event.clientX > rect.right - 18 || event.clientY > rect.bottom - 18,
      };
    };
    const up = (event: PointerEvent) => {
      if (!drag) return;
      const dx = event.clientX - drag.startX,
        dy = event.clientY - drag.startY;
      if (drag.resize) {
        void mutate("updateShot", {
          shotId: drag.shot.id,
          patch: {
            layoutColSpan: dx > 30 ? 2 : 1,
            layoutRowSpan: dy > 30 ? 2 : 1,
          },
        });
      } else if (Math.hypot(dx, dy) > 25) {
        const target = (
          document.elementFromPoint(
            event.clientX,
            event.clientY,
          ) as HTMLElement | null
        )?.closest<HTMLElement>(".comic-cell");
        const targetIndex = target ? cells.indexOf(target) : -1;
        if (targetIndex >= 0 && targetIndex !== drag.index) {
          const direction = targetIndex > drag.index ? 1 : -1;
          for (let step = 0; step < Math.abs(targetIndex - drag.index); step++)
            void mutate("moveShot", { shotId: drag.shot.id, direction });
        }
      }
      drag = null;
    };
    stage.addEventListener("pointerdown", down);
    stage.addEventListener("pointerup", up);
    return () => {
      stage.removeEventListener("pointerdown", down);
      stage.removeEventListener("pointerup", up);
    };
  }, [page.id, page.shots, pageRef, mutate]);
  const dimensions =
    layout.ratio === "strip"
      ? { width: 900, height: 1800 }
      : layout.ratio === "square"
        ? { width: 900, height: 900 }
        : layout.ratio === "custom"
          ? { width: layout.width, height: layout.height }
          : { width: 900, height: 1273 };
  return (
    <>
      <div className="panel-top">
        <div>
          <small>PAGE COMPOSER</small>
          <h1>
            第 {page.number} 页 · {page.title}
          </h1>
        </div>
        <div>
          <label className="draft-toggle">
            <input
              type="checkbox"
              checked={draft}
              onChange={(e) => setDraft(e.target.checked)}
            />
            草稿导出
          </label>
          <button onClick={() => exportPage("pdf")} disabled={!ready && !draft}>
            <Download size={15} />
            整章 PDF
          </button>
          <button
            className="primary"
            onClick={() => exportPage("png")}
            disabled={busy || (!ready && !draft)}
          >
            <FileImage size={15} />
            导出 PNG
          </button>
        </div>
      </div>
      {!ready && (
        <div className="layout-warning">
          <ImageIcon size={16} />
          <span>
            尚有分格没有正式画面。可继续排版并导出带“DRAFT”水印的草稿，正式导出前必须补齐。
          </span>
        </div>
      )}
      <div className="layout-workspace">
        <aside className="layout-tools">
          <h3>页面设置</h3>
          <label>
            页面比例
            <select
              value={layout.ratio}
              onChange={(e) =>
                patchLayout({ ratio: e.target.value as PageLayout["ratio"] })
              }
            >
              <option value="a4">A4 竖版</option>
              <option value="strip">长条漫画</option>
              <option value="square">方形社交媒体</option>
              <option value="custom">自定义</option>
            </select>
          </label>
          {layout.ratio === "custom" && (
            <div className="field-pair">
              <Field
                label="宽度"
                value={String(layout.width)}
                change={(v) => patchLayout({ width: Number(v) || 900 })}
              />
              <Field
                label="高度"
                value={String(layout.height)}
                change={(v) => patchLayout({ height: Number(v) || 1273 })}
              />
            </div>
          )}
          <label>
            分格模板
            <select
              value={layout.template}
              onChange={(e) =>
                patchLayout({
                  template: e.target.value as PageLayout["template"],
                })
              }
            >
              <option value="dynamic">动态布局</option>
              <option value="grid-4">四格 · 均分</option>
              <option value="rhythm-5">五格 · 节奏型</option>
              <option value="grid-6">六格 · 网格</option>
              <option value="grid-8">八格 · 网格</option>
            </select>
          </label>
          <div className="field-pair">
            <Field
              label="格间距"
              value={String(layout.gap)}
              change={(v) => patchLayout({ gap: Math.max(0, Number(v) || 0) })}
            />
            <Field
              label="页边距"
              value={String(layout.padding)}
              change={(v) =>
                patchLayout({ padding: Math.max(0, Number(v) || 0) })
              }
            />
          </div>
          {cropShot && (
            <section className="crop-controls">
              <h3>第 {cropShot.position} 格裁切</h3>
              <label>
                水平焦点 {cropShot.cropX}%
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={cropShot.cropX}
                  onChange={(e) =>
                    void mutate("updateShot", {
                      shotId: cropShot.id,
                      patch: { cropX: Number(e.target.value) },
                    })
                  }
                />
              </label>
              <label>
                垂直焦点 {cropShot.cropY}%
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={cropShot.cropY}
                  onChange={(e) =>
                    void mutate("updateShot", {
                      shotId: cropShot.id,
                      patch: { cropY: Number(e.target.value) },
                    })
                  }
                />
              </label>
              <label>
                缩放 {cropShot.cropScale.toFixed(2)}×
                <input
                  type="range"
                  min=".5"
                  max="3"
                  step=".05"
                  value={cropShot.cropScale}
                  onChange={(e) =>
                    void mutate("updateShot", {
                      shotId: cropShot.id,
                      patch: { cropScale: Number(e.target.value) },
                    })
                  }
                />
              </label>
            </section>
          )}
          <h3>文字图层</h3>
          <button onClick={() => addLayer("speech")}>
            <MessageCircle size={15} />
            添加对白气泡
          </button>
          <button onClick={() => addLayer("narration")}>
            <Archive size={15} />
            添加旁白框
          </button>
          <button onClick={() => addLayer("sfx")}>
            <Sparkles size={15} />
            添加拟声词
          </button>
          <div className="read-order">
            <span>阅读顺序</span>
            <b>左 → 右，上 → 下</b>
          </div>
        </aside>
        <section className="page-stage">
          <div
            className={`comic-page template-${layout.template}`}
            data-page-id={page.id}
            ref={pageRef}
            style={
              {
                "--page-ratio": `${dimensions.width}/${dimensions.height}`,
                "--page-gap": `${layout.gap}px`,
                "--page-padding": `${layout.padding}px`,
              } as React.CSSProperties
            }
          >
            {page.shots.map((shot, i) => {
              const selected =
                shot.candidates.find((c) => c.selected) ?? shot.candidates[0];
              return (
                <div
                  onClick={() => setCropShotId(shot.id)}
                  className={`comic-cell cell-${i + 1} ${selected ? "" : "empty"} ${cropShotId === shot.id ? "crop-active" : ""}`}
                  key={shot.id}
                >
                  {selected ? (
                    <img
                      src={fileUrl(selected.imagePath)}
                      alt={shot.title}
                      style={{
                        objectPosition: `${shot.cropX}% ${shot.cropY}%`,
                        transform: `scale(${shot.cropScale})`,
                      }}
                    />
                  ) : (
                    <div className="page-empty">
                      <ImageIcon />
                      <b>第 {i + 1} 格</b>
                      <span>等待画面</span>
                    </div>
                  )}
                  <span>{i + 1}</span>
                </div>
              );
            })}
            {page.textLayers
              .filter((layer) => !layer.hidden)
              .map((layer) => (
                <button
                  key={layer.id}
                  onClick={() => setActiveLayerId(layer.id)}
                  className={`text-layer text-${layer.type} ${layer.id === activeLayerId ? "active" : ""} ${layer.x < 0 || layer.y < 0 || layer.x + layer.width > 100 || layer.y + layer.height > 100 ? "overflow-warning" : ""}`}
                  style={{
                    left: `${layer.x}%`,
                    top: `${layer.y}%`,
                    width: `${layer.width}%`,
                    height: `${layer.height}%`,
                    fontFamily: layer.fontFamily,
                    fontSize: `${layer.fontSize}px`,
                    color: layer.color,
                    background: layer.background,
                    borderColor: layer.borderColor,
                    transform: `rotate(${layer.rotation}deg)`,
                    zIndex: layer.zIndex,
                  }}
                >
                  {layer.text}
                </button>
              ))}
            {draft && <div className="draft-watermark">DRAFT</div>}
            <footer>
              <b>{data.episode.title}</b>
              <span>{page.number}</span>
            </footer>
          </div>
          <p>点击分格可调整图片焦点；文字图层支持拖动和完整样式设置。</p>
        </section>
        <aside className="layer-panel">
          <h3>页面图层</h3>
          {page.shots.map((s) => (
            <div key={s.id}>
              <ImageIcon size={14} />
              <span>
                第 {s.position} 格 · {s.title}
              </span>
              <i>
                {s.candidates.find((c) => c.selected) ? "正式" : "缺少画面"}
              </i>
            </div>
          ))}
          {page.textLayers.map((layer) => (
            <button
              className={layer.id === activeLayerId ? "active" : ""}
              onClick={() => setActiveLayerId(layer.id)}
              key={layer.id}
            >
              <MessageCircle size={14} />
              <span>
                {layer.type === "speech"
                  ? "对白"
                  : layer.type === "narration"
                    ? "旁白"
                    : "拟声"}{" "}
                · {layer.text.slice(0, 12)}
              </span>
              <i>{layer.hidden ? "隐藏" : "显示"}</i>
            </button>
          ))}
          {active && (
            <section className="layer-properties">
              <h3>文字属性</h3>
              <Field
                label="文字"
                textarea
                value={active.text}
                change={(v) => patchLayer(active.id, { text: v })}
              />
              <label className="field">
                <span>字体</span>
                <select
                  value={active.fontFamily}
                  onChange={(e) =>
                    void patchLayer(active.id, { fontFamily: e.target.value })
                  }
                >
                  <option>Microsoft YaHei</option>
                  <option>SimSun</option>
                  <option>STKaiti</option>
                  <option>Arial</option>
                </select>
              </label>
              <div className="color-fields">
                <label>
                  文字
                  <input
                    type="color"
                    value={active.color}
                    onChange={(e) =>
                      void patchLayer(active.id, { color: e.target.value })
                    }
                  />
                </label>
                <label>
                  背景
                  <input
                    type="color"
                    value={active.background}
                    onChange={(e) =>
                      void patchLayer(active.id, { background: e.target.value })
                    }
                  />
                </label>
                <label>
                  边框
                  <input
                    type="color"
                    value={active.borderColor}
                    onChange={(e) =>
                      void patchLayer(active.id, {
                        borderColor: e.target.value,
                      })
                    }
                  />
                </label>
              </div>
              <div className="field-pair">
                <Field
                  label="X %"
                  value={String(active.x)}
                  change={(v) => patchLayer(active.id, { x: Number(v) })}
                />
                <Field
                  label="Y %"
                  value={String(active.y)}
                  change={(v) => patchLayer(active.id, { y: Number(v) })}
                />
                <Field
                  label="宽 %"
                  value={String(active.width)}
                  change={(v) => patchLayer(active.id, { width: Number(v) })}
                />
                <Field
                  label="高 %"
                  value={String(active.height)}
                  change={(v) => patchLayer(active.id, { height: Number(v) })}
                />
              </div>
              <div className="field-pair">
                <Field
                  label="字号"
                  value={String(active.fontSize)}
                  change={(v) => patchLayer(active.id, { fontSize: Number(v) })}
                />
                <Field
                  label="层级"
                  value={String(active.zIndex)}
                  change={(v) => patchLayer(active.id, { zIndex: Number(v) })}
                />
                <Field
                  label="旋转"
                  value={String(active.rotation)}
                  change={(v) => patchLayer(active.id, { rotation: Number(v) })}
                />
              </div>
              {(active.x < 0 ||
                active.y < 0 ||
                active.x + active.width > 100 ||
                active.y + active.height > 100) && (
                <p className="overflow-note">文字图层超出页面边界</p>
              )}
              <div className="layer-actions">
                <button
                  onClick={() =>
                    patchLayer(active.id, { locked: !active.locked })
                  }
                >
                  {active.locked ? <Lock /> : <LockOpen />}
                </button>
                <button
                  onClick={() =>
                    patchLayer(active.id, { hidden: !active.hidden })
                  }
                >
                  {active.hidden ? <Eye /> : <EyeOff />}
                </button>
                <button
                  onClick={() =>
                    mutate("duplicateTextLayer", { layerId: active.id })
                  }
                >
                  <Copy />
                </button>
                <button
                  className="danger"
                  onClick={() => {
                    mutate("deleteTextLayer", { layerId: active.id });
                    setActiveLayerId(null);
                  }}
                >
                  <Trash2 />
                </button>
              </div>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}

function Assets({ data }: { data: StudioData }) {
  const [current, setCurrent] = useState(data);
  const [active, setActive] = useState(data.assets[0]);
  const [wizard, setWizard] = useState(false);
  const [editingCharacterId, setEditingCharacterId] = useState<string | null>(null);
  const [packageCharacterId, setPackageCharacterId] = useState<string | null>(
    data.characters[0]?.id ?? null,
  );
  const [query, setQuery] = useState("");
  const [assetType, setAssetType] = useState<
    "all" | "character" | "outfit" | "shoes"
  >("all");
  const [qualityOnly, setQualityOnly] = useState(false);
  const [assetMessage, setAssetMessage] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [outfitAnalyzing, setOutfitAnalyzing] = useState(false);
  const [outfitPromptDraft, setOutfitPromptDraft] = useState<null | { characterId: string; summaryCn: string; baseOutfitEn: string; baseShoesEn: string; outfitNegativeEn: string }>(null);
  const [profileDrafted, setProfileDrafted] = useState(false);
  const [form, setForm] = useState({
    name: "",
    conceptCn: "",
    notes: "",
    descriptionCn: "",
    appearanceEn: "",
    invariantsEn: "",
    hairColorEn: "",
    hairStyleEn: "",
    eyeColorEn: "",
    profile: {
      agePresentationEn: "", faceShapeEn: "", bodyTypeEn: "", skinToneEn: "",
      distinguishingFeaturesEn: "", temperamentEn: "", baseOutfitEn: "", baseShoesEn: "",
    },
  });
  const refreshCharacters = async () => {
    const response = await fetch("/api/characters", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "refresh", projectId: data.project.id }) });
    if (response.ok) setCurrent(await response.json());
  };
  useEffect(() => {
    if (!current.characters.some((character) => character.assetJobs?.some((job) => ["queued", "running"].includes(job.status)))) return;
    const timer = window.setInterval(() => void refreshCharacters(), 3000);
    return () => window.clearInterval(timer);
  }, [current.characters]);
  const draftProfile = async (provider = "deepseek") => {
    setDrafting(true); setAssetMessage("");
    try {
    const response = await fetch("/api/characters", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "draftProfile", provider, name: form.name, conceptCn: form.conceptCn, notes: form.notes }) });
    const result = await response.json(); setDrafting(false);
    if (!response.ok) return setAssetMessage(result.error || "人物档案草拟失败");
    const draft = result.draft;
    setForm({ ...form, descriptionCn: draft.descriptionCn, appearanceEn: draft.appearanceEn, hairColorEn: draft.hairColorEn, hairStyleEn: draft.hairStyleEn, eyeColorEn: draft.eyeColorEn, invariantsEn: draft.invariantsEn.join(", "), profile: draft.profile });
    setProfileDrafted(true);
    } catch { setAssetMessage("人物档案请求失败，请检查模型服务后重试"); }
    finally { setDrafting(false); }
  };
  const create = async () => {
    const response = await fetch("/api/characters", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...form, action: editingCharacterId ? "updateProfile" : "create", characterId: editingCharacterId, visualTraits: { hairColorEn: form.hairColorEn, hairStyleEn: form.hairStyleEn, eyeColorEn: form.eyeColorEn }, invariantsEn: form.invariantsEn.split(/[,;\n]/).map((value) => value.trim()).filter(Boolean), confirm: true, projectId: data.project.id }),
    });
    if (response.ok) {
      const result = (await response.json()) as StudioData;
      setCurrent(result);
      setWizard(false);
      setPackageCharacterId(editingCharacterId || result.characters.find((character) => character.name === form.name)?.id || null);
      setEditingCharacterId(null);
    }
  };
  const generateAsset = async (characterId: string, type: string, provider = "sd") => {
    setAssetMessage("");
    const response = await fetch("/api/characters", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "generateAsset", characterId, type, provider }) });
    const result = await response.json();
    if (!response.ok) return setAssetMessage(result.error || "无法创建生成任务");
    setAssetMessage("任务已创建；可以离开页面，完成后候选会自动出现。");
    await refreshCharacters();
  };
  const confirmAsset = async (characterId: string, candidateId: number) => {
    const response = await fetch("/api/characters", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "confirmCandidate", characterId, candidateId, projectId: data.project.id }) });
    const result = await response.json();
    if (!response.ok) return setAssetMessage(result.error || "确认失败");
    setCurrent(result); setAssetMessage("候选已确认为正式角色资产。");
  };
  const analyzeOutfitReference = async (characterId: string, file?: File) => {
    if (!file) return;
    setOutfitAnalyzing(true); setAssetMessage("正在识别服装参考图，请稍候…");
    const body = new FormData(); body.append("action", "draftOutfitPrompt"); body.append("provider", "codex"); body.append("characterId", characterId); body.append("file", file);
    const response = await fetch("/api/characters", { method: "POST", body });
    const result = await response.json(); setOutfitAnalyzing(false);
    if (!response.ok) return setAssetMessage(result.error || "服装参考图识别失败");
    setOutfitPromptDraft({ characterId, ...result.draft }); setAssetMessage("");
  };
  const saveOutfitPrompt = async () => {
    if (!outfitPromptDraft) return;
    const response = await fetch("/api/characters", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "updateOutfitPrompt", generate: true, projectId: data.project.id, ...outfitPromptDraft }) });
    const result = await response.json();
    if (!response.ok) return setAssetMessage(result.error || "保存服装提示词失败");
    setCurrent(result.data); setOutfitPromptDraft(null); setAssetMessage(result.jobId ? "服装提示词已更新，基础服装已加入生成队列。" : `服装提示词已更新。${result.generationError || ""}`);
  };
  const uploadReference = async (
    characterId: string,
    type: string,
    file?: File,
  ) => {
    if (!file) return;
    const body = new FormData();
    body.append("projectId", String(data.project.id));
    body.append("characterId", characterId);
    body.append("type", type);
    body.append("file", file);
    const response = await fetch("/api/characters", { method: "POST", body });
    if (response.ok) setCurrent(await response.json());
  };
  const referenceTypes = [
    ["face", "标准正脸"],
    ["turnaround", "三视图"],
    ["expressions", "表情表"],
    ["outfit", "基础服装"],
    ["shoes", "基础鞋履"],
  ] as const;
  const visibleCharacters = current.characters.filter((character) =>
    isDisplayableCharacterName(character.name),
  );
  useEffect(() => {
    if (!packageCharacterId || !visibleCharacters.some((character) => character.id === packageCharacterId)) {
      setPackageCharacterId(visibleCharacters[0]?.id ?? null);
    }
  }, [current.characters, packageCharacterId]);
  const packageCharacter = current.characters.find(
    (character) => character.id === packageCharacterId,
  );
  const visibleAssets = current.assets.filter(
    (asset) =>
      asset.characterId === packageCharacterId &&
      (assetType === "all" || asset.type === assetType) &&
      (!qualityOnly ||
        [
          "partial_outfit",
          "partial_footwear",
          "not_generation_ready",
          "unknown",
        ].includes(asset.qualityStatus)) &&
      (!query ||
        `${asset.name} ${asset.id} ${asset.tags.join(" ")}`
          .toLowerCase()
          .includes(query.toLowerCase())),
  );
  const qualityLabel: Record<string, string> = {
    complete_identity: "身份基准完整",
    complete_outfit: "完整套装",
    partial_outfit: "服装裁切不完整",
    partial_footwear: "局部鞋履参考",
    not_generation_ready: "不适合生成",
    unknown: "待人工确认",
  };
  useEffect(() => {
    if (!active || !visibleAssets.some((asset) => asset.id === active.id))
      setActive(visibleAssets[0]);
  }, [active, visibleAssets]);
  return (
    <>
      <div className="page-title row asset-page-title">
        <div>
          <small>ASSET LIBRARY</small>
          <h1>角色资产</h1>
          <p>浏览人物、服装与鞋履参考；不完整资产不会被误当作完整生成参考。</p>
        </div>
        <button
          className="primary create-character-button"
          onClick={() => { setEditingCharacterId(null); setProfileDrafted(false); setForm({ name: "", conceptCn: "", notes: "", descriptionCn: "", appearanceEn: "", invariantsEn: "", hairColorEn: "", hairStyleEn: "", eyeColorEn: "", profile: { agePresentationEn: "", faceShapeEn: "", bodyTypeEn: "", skinToneEn: "", distinguishingFeaturesEn: "", temperamentEn: "", baseOutfitEn: "", baseShoesEn: "" } }); setWizard(true); }}
        >
          <Plus size={15} />
          创建人物
        </button>
      </div>
      <div className="character-summary">
        {visibleCharacters.map((character) => (
          <article
            className={character.id === packageCharacterId ? "active" : ""}
            key={character.id}
            onClick={() => setPackageCharacterId(character.id)}
          >
            <UserRound />
            <div>
              <b>{character.name}</b>
              <code>{character.id}</code>
              {character.id.startsWith("character_story_") && <small className="character-origin">剧情识别角色</small>}
            </div>
            <span className={character.status}>
              {character.status === "ready" ? "基准包已启用" : character.profileStatus !== "confirmed" ? "档案待确认" : !character.references.some((reference) => reference.type === "face" && reference.confirmed) && (character.assetCandidates?.length || 0) > 0 ? "正脸待选择" : `${character.references.filter((reference) => reference.confirmed).length}/5 · 待补资产`}
            </span>
          </article>
        ))}
      </div>
      {packageCharacter && (
        <section className="character-package">
          <div className="character-package-head">
            <h3>{packageCharacter.name} · 基准包</h3>
            <p className="character-origin-line">
              {packageCharacter.id.startsWith("character_story_") ? "来源：剧情识别" : "来源：角色资产库"}
            </p>
            <p>
              不可变约束：
              {packageCharacter.invariantsEn.join("、") || "尚未确认"}
            </p>
            <code>{packageCharacter.id}</code>
            <button className="character-edit-button" onClick={() => { setEditingCharacterId(packageCharacter.id); setForm({ name: packageCharacter.name, conceptCn: packageCharacter.conceptCn || packageCharacter.descriptionCn, notes: packageCharacter.notes || "", descriptionCn: packageCharacter.descriptionCn, appearanceEn: packageCharacter.appearanceEn, invariantsEn: packageCharacter.invariantsEn.join(", "), hairColorEn: packageCharacter.visualTraits.hairColorEn, hairStyleEn: packageCharacter.visualTraits.hairStyleEn, eyeColorEn: packageCharacter.visualTraits.eyeColorEn, profile: packageCharacter.profile || { agePresentationEn: "", faceShapeEn: "", bodyTypeEn: "", skinToneEn: "", distinguishingFeaturesEn: "", temperamentEn: "", baseOutfitEn: "", baseShoesEn: "" } }); setProfileDrafted(true); setWizard(true); }}>编辑档案</button>
            <button className="primary" onClick={() => void generateAsset(packageCharacter.id, packageCharacter.references.some((reference) => reference.type === "face" && reference.confirmed) ? (referenceTypes.find(([type]) => !packageCharacter.references.some((reference) => reference.type === type && reference.confirmed))?.[0] || "face") : "face")}>{packageCharacter.references.some((reference) => reference.type === "face" && reference.confirmed) ? "继续生成" : "生成正脸候选"}</button>
          </div>
          {assetMessage && <p className="asset-message">{assetMessage}</p>}
          <div className="character-reference-grid">
            {referenceTypes.map(([type, label]) => {
              const reference = packageCharacter.references.find(
                (item) => item.type === type && item.confirmed,
              );
              const candidates = packageCharacter.assetCandidates?.filter((item) => item.type === type) || [];
              const latestJob = packageCharacter.assetJobs?.find((item) => item.type === type);
              const activeJob = packageCharacter.assetJobs?.find((item) => item.type === type && ["queued", "running"].includes(item.status));
              const latestCandidates = latestJob ? candidates.filter((item) => item.jobId === latestJob.id && !item.selected) : [];
              const faceReady = packageCharacter.references.some((item) => item.type === "face" && item.confirmed);
              return (
                <article className={reference ? "reference-card complete" : "reference-card"} key={type}>
                  <header><b>{label}</b><span>{latestJob?.status === "running" || latestJob?.status === "queued" ? latestJob.stage : latestJob?.status === "failed" ? "生成失败" : reference ? "已确认" : latestCandidates.length ? "候选待确认" : "待补齐"}</span></header>
                  {reference && <img src={fileUrl(reference.path)} alt={label} />}
                  {type === "outfit" && packageCharacter.profile?.baseOutfitEn && <details className="current-outfit-prompt"><summary>查看当前服装提示词</summary><p>{packageCharacter.profile.baseOutfitEn}</p>{packageCharacter.profile.outfitNegativeEn && <small>排除：{packageCharacter.profile.outfitNegativeEn}</small>}</details>}
                  {latestCandidates.length > 0 && <><small className="candidate-heading">本次新候选</small><div className="asset-candidates">{latestCandidates.map((candidate) => <button key={candidate.id} onClick={() => void confirmAsset(packageCharacter.id, candidate.id)}><img src={fileUrl(candidate.path)} alt={`${label}候选`} /><span>替换为此候选</span></button>)}</div></>}
                  {latestJob?.error && <small className="asset-error">{latestJob.error}</small>}
                  <footer>
                    <button disabled={Boolean(activeJob) || packageCharacter.profileStatus !== "confirmed" || (type !== "face" && !faceReady)} onClick={() => void generateAsset(packageCharacter.id, type)}>{activeJob ? "有任务生成中" : reference || candidates.length ? "SD 重新生成" : "SD 生成候选"}</button>
                    <button disabled={Boolean(activeJob) || packageCharacter.profileStatus !== "confirmed" || (type !== "face" && !faceReady)} onClick={() => void generateAsset(packageCharacter.id, type, "codex-imagegen")}>Codex 备选</button>
                    <label>手工上传<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void uploadReference(packageCharacter.id, type, event.target.files?.[0])} /></label>
                    {type === "outfit" && <label>{outfitAnalyzing ? "正在识别…" : "Codex 备选：参考图转提示词"}<input disabled={outfitAnalyzing} type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void analyzeOutfitReference(packageCharacter.id, event.target.files?.[0])} /></label>}
                  </footer>
                </article>
              );
            })}
          </div>
        </section>
      )}
      <section className="asset-toolbar">
        <span className="asset-owner-label">
          {packageCharacter?.name ?? "未选择人物"}的资产
        </span>
        <div className="asset-type-tabs">
          {(
            [
              ["all", "全部"],
              ["character", "人物"],
              ["outfit", "服装"],
              ["shoes", "鞋履"],
            ] as const
          ).map(([value, label]) => (
            <button
              className={assetType === value ? "active" : ""}
              onClick={() => setAssetType(value)}
              key={value}
            >
              {label}
              <span>
                {value === "all"
                  ? current.assets.filter((asset) => asset.characterId === packageCharacterId).length
                  : current.assets.filter((asset) => asset.characterId === packageCharacterId && asset.type === value)
                      .length}
              </span>
            </button>
          ))}
        </div>
        <label className="asset-search">
          <ScanSearch size={15} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索名称、编号或标签"
          />
        </label>
        <label className="quality-filter">
          <input
            type="checkbox"
            checked={qualityOnly}
            onChange={(event) => setQualityOnly(event.target.checked)}
          />
          只看待处理资产
        </label>
      </section>
      {active && (
        <div className="asset-workspace">
          <aside>
            <header>
              <b>{visibleAssets.length} 项资产</b>
              <span>选择一项查看完整参考</span>
            </header>
            {visibleAssets.map((asset) => (
              <button
                className={asset.id === active.id ? "active" : ""}
                onClick={() => setActive(asset)}
                key={asset.id}
              >
                <img src={fileUrl(asset.path)} alt="" />
                <div>
                  <span>
                    {asset.type === "character"
                      ? "人物"
                      : asset.type === "outfit"
                        ? "服装"
                        : "鞋履"}
                  </span>
                  <b>{asset.type === "character" ? current.characters.find((character) => character.id === asset.characterId)?.name ?? asset.name : asset.name}</b>
                  <small>{asset.id}</small>
                </div>
                <i
                  className={
                    asset.qualityStatus.startsWith("complete")
                      ? "complete"
                      : "attention"
                  }
                >
                  {qualityLabel[asset.qualityStatus]}
                </i>
              </button>
            ))}
          </aside>
          <section className="asset-detail">
            <div className="asset-image">
              <div className="asset-image-head">
                <span>
                  {active.type === "character"
                    ? "人物身份参考"
                    : active.type === "outfit"
                      ? "服装参考"
                      : "鞋履参考"}
                </span>
                <a href={fileUrl(active.path)} target="_blank">
                  查看原图
                </a>
              </div>
              <img src={fileUrl(active.path)} alt={active.name} />
            </div>
            <div className="asset-meta">
              <div className="asset-meta-kicker">
                <span className="pill">
                  {active.type === "character"
                    ? "人物"
                    : active.type === "outfit"
                      ? "服装"
                      : "鞋履"}
                </span>
                <span
                  className={`quality-badge ${active.qualityStatus.startsWith("complete") ? "complete" : "attention"}`}
                >
                  {qualityLabel[active.qualityStatus]}
                </span>
              </div>
              <h2>{active.type === "character" ? current.characters.find((character) => character.id === active.characterId)?.name ?? active.name : active.name}</h2>
              {active.type === "character" && <p className="character-origin-line">{active.characterId.startsWith("character_story_") ? "来源：剧情识别角色" : "来源：角色资产库"}</p>}
              <code>{active.id}</code>
              <div className="asset-tags">
                {active.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
              <section>
                <h3>生成描述</h3>
                <p>{active.visualDescriptionEn || "尚未填写英文视觉描述"}</p>
              </section>
              <section>
                <h3>资产状态</h3>
                <dl>
                  <dt>质量判断</dt>
                  <dd>{qualityLabel[active.qualityStatus]}</dd>
                  <dt>生成资格</dt>
                  <dd className={active.confirmed ? "ok" : ""}>
                    {active.confirmed ? (
                      <>
                        <Check size={13} />
                        已确认，可参与生成
                      </>
                    ) : (
                      "尚未确认，禁止参与生成"
                    )}
                  </dd>
                  <dt>所属人物</dt>
                  <dd>
                    {current.characters.find(
                      (character) => character.id === active.characterId,
                    )?.name ?? active.characterId}
                  </dd>
                </dl>
              </section>
              <div className="asset-detail-actions">
                <button
                  onClick={() => setPackageCharacterId(active.characterId)}
                >
                  查看人物基准包
                </button>
                <a href={fileUrl(active.path)} target="_blank">
                  打开参考图
                </a>
              </div>
            </div>
          </section>
        </div>
      )}
      {!active && (
        <div className="asset-empty">
          <ScanSearch />
          <h3>没有匹配的资产</h3>
          <p>调整搜索词或筛选条件。</p>
        </div>
      )}
      {wizard && (
        <div className="modal-backdrop" onClick={() => setWizard(false)}>
          <section
            className="quick-dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <small>CHARACTER WIZARD · PROFILE</small>
            <h2>{editingCharacterId ? "编辑人物档案" : "建立新人物档案"}</h2>
            <Field
              label="人物名称"
              value={form.name}
              change={(value) => setForm({ ...form, name: value })}
            />
            {current.characters.some((character) => character.name === form.name && character.id !== editingCharacterId) && <p className="asset-error">全局角色库中已有同名人物；仍可创建，但请通过头像、特征和角色 ID 区分。</p>}
            <Field
              label="中文角色概念"
              textarea
              value={form.conceptCn}
              change={(value) => setForm({ ...form, conceptCn: value })}
            />
            <Field label="可选备注" textarea value={form.notes} change={(value) => setForm({ ...form, notes: value })} />
            {!profileDrafted && <button className="primary profile-draft-button" disabled={!form.name || !form.conceptCn || drafting} onClick={() => void draftProfile()}>{drafting ? "正在草拟人物档案…" : "用已配置模型草拟人物设定"}</button>}
            {assetMessage && <p className="asset-error">{assetMessage}</p>}
            {profileDrafted && <>
            <div className="profile-confirm-note"><Check size={14} />请检查并确认以下内容。图片生成只会使用这些英文设定。</div>
            <Field label="中文设定摘要" textarea value={form.descriptionCn} change={(value) => setForm({ ...form, descriptionCn: value })} />
            <Field
              label="英文视觉设定（生图使用）"
              textarea
              value={form.appearanceEn}
              change={(value) => setForm({ ...form, appearanceEn: value })}
            />
            <div className="field-pair">
              <Field
                label="发色（英文）"
                value={form.hairColorEn}
                change={(value) => setForm({ ...form, hairColorEn: value })}
              />
              <Field
                label="瞳色（英文）"
                value={form.eyeColorEn}
                change={(value) => setForm({ ...form, eyeColorEn: value })}
              />
            </div>
            <Field
              label="发型（英文）"
              value={form.hairStyleEn}
              change={(value) => setForm({ ...form, hairStyleEn: value })}
            />
            <Field
              label="不可变特征（英文，逗号分隔）"
              textarea
              value={form.invariantsEn}
              change={(value) => setForm({ ...form, invariantsEn: value })}
            />
            <Field label="基础服装（英文）" textarea value={form.profile.baseOutfitEn} change={(value) => setForm({ ...form, profile: { ...form.profile, baseOutfitEn: value } })} />
            <Field label="基础鞋履（英文）" textarea value={form.profile.baseShoesEn} change={(value) => setForm({ ...form, profile: { ...form.profile, baseShoesEn: value } })} />
            </>}
            <footer>
              <button onClick={() => setWizard(false)}>取消</button>
              {profileDrafted && <button disabled={drafting} onClick={() => void draftProfile()}>重新草拟</button>}
              <button disabled={drafting || !form.name || !form.conceptCn} onClick={() => void draftProfile("codex")}>Codex 备选草拟</button>
              <button
                className="primary"
                disabled={
                  !profileDrafted ||
                  !form.name ||
                  !form.appearanceEn ||
                  !form.hairColorEn ||
                  !form.hairStyleEn ||
                  !form.eyeColorEn ||
                  /[\u3400-\u9fff]/.test(form.appearanceEn)
                }
                onClick={create}
              >
                确认档案并创建人物
              </button>
            </footer>
          </section>
        </div>
      )}
      {outfitPromptDraft && (
        <div className="modal-backdrop" onClick={() => setOutfitPromptDraft(null)}>
          <section className="quick-dialog outfit-prompt-dialog" onClick={(event) => event.stopPropagation()}>
            <small>OUTFIT REFERENCE · PROMPT REVIEW</small>
            <h2>确认服装提示词</h2>
            <p className="profile-confirm-note">{outfitPromptDraft.summaryCn}</p>
            <Field label="基础服装正向提示词（英文）" textarea value={outfitPromptDraft.baseOutfitEn} change={(value) => setOutfitPromptDraft({ ...outfitPromptDraft, baseOutfitEn: value })} />
            <Field label="鞋履提示词（英文，可留空）" textarea value={outfitPromptDraft.baseShoesEn} change={(value) => setOutfitPromptDraft({ ...outfitPromptDraft, baseShoesEn: value })} />
            <Field label="服装负向提示词（英文）" textarea value={outfitPromptDraft.outfitNegativeEn} change={(value) => setOutfitPromptDraft({ ...outfitPromptDraft, outfitNegativeEn: value })} />
            <footer><button onClick={() => setOutfitPromptDraft(null)}>取消</button><button className="primary" onClick={() => void saveOutfitPrompt()}>确认并写入人物档案</button></footer>
          </section>
        </div>
      )}
    </>
  );
}

function Continuity({
  data,
  mutate,
  refresh,
}: {
  data: StudioData;
  mutate: (
    action: string,
    payload: Record<string, unknown>,
  ) => Promise<StudioData>;
  refresh: () => Promise<void>;
}) {
  const [planning,setPlanning]=useState("");
  const [planningError,setPlanningError]=useState("");
  const visualAction=async(action:string,shotId?:number,force=false)=>{
    setPlanning(`${action}:${shotId||0}`);setPlanningError("");
    try{
      const response=await fetch("/api/visual-planning",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action,projectId:data.project.id,episodeId:data.episode.id,shotId,force})});
      const result=await response.json();if(!response.ok)throw new Error(result.error||"视觉规划失败");await refresh();
    }catch(error){setPlanningError(error instanceof Error?error.message:"视觉规划失败");}finally{setPlanning("");}
  };
  const shots = data.episode.pages.flatMap((page) => page.shots);
  const charactersOk = shots.every((shot) =>
    shot.characterIds.includes("character_xiaofen"),
  );
  const blankAssets = shots.filter((shot) => !shot.outfitId || !shot.shoeId);
  const pageConflicts = data.episode.pages.filter(
    (page) =>
      new Set(page.shots.map((shot) => `${shot.outfitId}|${shot.shoeId}`))
        .size > 1,
  );
  const times = [
    ...new Set(shots.map((shot) => shot.timeOfDay).filter(Boolean)),
  ];
  const completed = shots.filter((shot) =>
    shot.candidates.some((candidate) => candidate.selected),
  ).length;
  return (
    <>
      <div className="page-title">
        <small>SERIES MEMORY</small>
        <h1>连载记忆与连续性</h1>
        <p>检查结果根据当前分镜实时计算，不再使用固定示例文案。</p>
      </div>
      <div className="continuity-page">
        <section>
          <div className="block-head">
            <div>
              <small>TIMELINE</small>
              <h2>本话时间线</h2>
            </div>
            <span className="pill">{data.episode.title}</span>
          </div>
          <div className="memory-box">
            <span>DeepSeek 全章视觉规划</span>
            <p>{data.episode.visualPlan ? `规划版本 ${data.episode.visualPlanVersion} · ${data.episode.visualPlanConfirmed?"已确认":"待确认"}` : "尚未生成，当前使用本地规则模式。"}</p>
            {planningError&&<p className="config-message">{planningError}</p>}
            <button disabled={Boolean(planning)} onClick={()=>void visualAction("plan-chapter")}>{planning==="plan-chapter:0"?"正在规划…":data.episode.visualPlan?"重新分析全章":"分析全章"}</button>{" "}
            {data.episode.visualPlan&&!data.episode.visualPlanConfirmed&&<button disabled={Boolean(planning)} onClick={()=>void visualAction("confirm-chapter")}>确认规划</button>}
            {data.episode.visualPlanConfirmed&&<><button disabled={Boolean(planning)} onClick={()=>void visualAction("refine-all")}>{planning==="refine-all:0"?"正在批量细化…":"批量细化未处理镜头"}</button>{" "}<button disabled={Boolean(planning)||!shots.some((shot)=>shot.visualSpec&&!shot.visualSpecConfirmed)} onClick={()=>void visualAction("confirm-all-shots")}>确认全部待确认规格</button></>}
          </div>
          <div className="timeline">
            {data.timeline.map((item, i) => (
              <article key={item.id}>
                <i>{i + 1}</i>
                <div>
                  <small>{item.timeOfDay}</small>
                  <h3>{item.label}</h3>
                  <p>{item.note}</p>
                  <span>{item.outfitId}</span>
                  <span>{item.shoeId}</span>
                </div>
              </article>
            ))}
          </div>
          <div className="memory-box">
            <span>单镜头视觉规格</span>
            {shots.map((shot)=><VisualSpecEditor key={`visual-${shot.id}`} shot={shot} projectId={data.project.id} episodeId={data.episode.id} disabled={Boolean(planning)} busy={planning===`refine-shot:${shot.id}`} onRefine={(force)=>visualAction("refine-shot",shot.id,force)} onConfirm={()=>visualAction("confirm-shot",shot.id)} onSaved={refresh}/>) }
          </div>
          {data.seriesMemory && (
            <div className="memory-box">
              <span>当前连载记忆</span>
              <pre>{data.seriesMemory}</pre>
            </div>
          )}
        </section>
        <aside>
          <h3>连续性检查</h3>
          <ContinuityCheck
            ok={charactersOk}
            title="角色匹配"
            detail={
              charactersOk ? "所有分镜均包含主角" : "存在未匹配主角的分镜"
            }
          />
          <ContinuityCheck
            ok={blankAssets.length === 0}
            title="服装与鞋履"
            detail={
              blankAssets.length
                ? `${blankAssets.length} 格缺少服装或鞋履编号`
                : `所有 ${shots.length} 格均已锁定资产编号`
            }
          />
          <ContinuityCheck
            ok={pageConflicts.length === 0}
            title="同页造型"
            detail={
              pageConflicts.length
                ? `第 ${pageConflicts.map((page) => page.number).join("、")} 页存在多套造型，请确认是否为剧情换装`
                : "每页人物造型保持一致"
            }
          />
          <ContinuityCheck
            ok={times.length > 0}
            title="时间顺序"
            detail={times.length ? times.join(" → ") : "尚未填写时间"}
          />
          <ContinuityCheck
            ok={completed === shots.length}
            title="正式画面"
            detail={`${completed} / ${shots.length} 格已选择正式版本`}
          />
          <div className="memory-box">
            <span>话末记忆更新</span>
            <p>全部分格确认后，将本话最终时间、造型和人物状态写入连载记忆。</p>
            <button
              disabled={completed !== shots.length}
              onClick={() =>
                void mutate("updateSeriesMemory", {
                  episodeId: data.episode.id,
                })
              }
            >
              {completed === shots.length
                ? "生成并写入更新草案"
                : "等待本话完成"}
            </button>
          </div>
        </aside>
      </div>
    </>
  );
}

function ContinuityCheck({
  ok,
  title,
  detail,
}: {
  ok: boolean;
  title: string;
  detail: string;
}) {
  return (
    <div className={`check-card ${ok ? "ok" : "warning"}`}>
      {ok ? <Check /> : <ScanSearch />}
      <div>
        <b>{title}</b>
        <span>{detail}</span>
      </div>
    </div>
  );
}

function VisualSpecEditor({shot,projectId,episodeId,disabled,busy,onRefine,onConfirm,onSaved}:{shot:Shot;projectId:number;episodeId:number;disabled:boolean;busy:boolean;onRefine:(force:boolean)=>Promise<void>;onConfirm:()=>Promise<void>;onSaved:()=>Promise<void>}) {
  const choiceLabels:Record<string,string>={pick:'取物',place:'放置',open:'打开',close:'关闭',operate_environment:'操作设施',write:'书写',tool:'使用工具',push:'推',pull:'拉',hold:'持有',inspect:'查看',drink:'饮用',carry:'携带',touch:'触摸',read:'阅读',anticipation:'动作前',contact:'动作进行中',follow_through:'动作完成后',left:'左手',right:'右手',both:'双手',approach:'尚未接触',released:'已经松开',on_support:'位于支持物上',held:'手中持有',unspecified:'未明确',object:'当前物体',character:'镜头中的人物',independent:'独立方向'};
  const [open,setOpen]=useState(false);const [draft,setDraft]=useState(shot.visualSpec);const [saving,setSaving]=useState(false);const [message,setMessage]=useState("");
  useEffect(()=>setDraft(shot.visualSpec),[shot.visualSpec]);
  const patchCharacter=(index:number,key:string,value:string)=>setDraft((current)=>current?{...current,characters:current.characters.map((item,i)=>i===index?{...item,[key]:value}:item)}:current);
  const patchAppearance=(index:number,key:string,value:string|string[])=>setDraft((current)=>current?{...current,characters:current.characters.map((item,i)=>i===index?{...item,appearanceState:{...item.appearanceState,[key]:value}}:item)}:current);
  const patchInteraction=(index:number,group:string,key:string,value:string)=>setDraft(current=>current?{...current,interactions:(current.interactions||[]).map((relation,i)=>{
    if(i!==index||!relation.visualFacts)return relation;
    const facts=relation.visualFacts;
    const next=group==='root'?{...facts,[key]:value}:{...facts,[group]:{...(facts[group as keyof typeof facts] as object),[key]:['count','u','v','width','height'].includes(key)?Number(value):value}};
    return {...relation,visualFacts:next};
  })}:current);
  const save=async()=>{if(!draft)return;setSaving(true);setMessage("");try{const response=await fetch("/api/visual-planning",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"update-shot-spec",projectId,episodeId,shotId:shot.id,spec:draft})});const result=await response.json();if(!response.ok)throw new Error(result.error||"保存失败");setDraft(result.spec);setMessage(result.translationMeta?"中文和 unknown 已自动转换为英文，规格已保存并确认":"人工规格已保存并确认");await onSaved();}catch(error){setMessage(error instanceof Error?error.message:"保存失败");}finally{setSaving(false);}};
  const field=(label:string,value:string,onChange:(value:string)=>void)=><label className="visual-spec-field"><span>{label}</span><input value={value} onChange={(e)=>onChange(e.target.value)}/></label>;
  return <details className="visual-spec-card" open={open} onToggle={(event)=>setOpen(event.currentTarget.open)}>
    <summary>
      <span><b>第 {shot.position} 格 · {shot.title}</b><small>{shot.visualSpec?`${shot.visualSpecSource} · v${shot.visualSpecVersion} · ${shot.visualSpecConfirmed?"已确认":"待确认"}`:"规则模式 · 尚未细化"}</small></span>
      <span className="visual-spec-summary-actions"><button type="button" disabled={disabled} onClick={(e)=>{e.preventDefault();void onRefine(Boolean(shot.visualSpec));}}>{busy?"细化中…":shot.visualSpec?"重新分析":"AI 细化"}</button>{shot.visualSpec&&!shot.visualSpecConfirmed&&<button className="primary" type="button" disabled={disabled} onClick={(e)=>{e.preventDefault();void onConfirm();}}>确认并用于生图</button>}</span>
    </summary>
    {draft&&<div className="visual-spec-form">
      <section className="visual-spec-section facts-section"><div className="visual-spec-section-title"><span>01</span><div><b>画面事实</b><small>每行一条，描述这一格必须清楚传达的信息</small></div></div><textarea value={draft.visibleFacts.join("\n")} onChange={(e)=>setDraft({...draft,visibleFacts:e.target.value.split(/\n/).map(x=>x.trim()).filter(Boolean)})}/></section>
      <section className="visual-spec-section"><div className="visual-spec-section-title"><span>02</span><div><b>场景与光线</b><small>定义环境、时间和画面气氛</small></div></div><div className="visual-spec-fields">{field("地点",draft.scene.location,(value)=>setDraft({...draft,scene:{...draft.scene,location:value}}))}{field("天气",draft.scene.weather,(value)=>setDraft({...draft,scene:{...draft.scene,weather:value}}))}{field("时间",draft.scene.timeOfDay,(value)=>setDraft({...draft,scene:{...draft.scene,timeOfDay:value}}))}{field("光线",draft.scene.lighting,(value)=>setDraft({...draft,scene:{...draft.scene,lighting:value}}))}</div></section>
      {draft.characters.map((character,index)=><fieldset className="visual-character-card" key={character.characterId}><legend><UserRound size={15}/><span>{character.characterId}</span></legend><div className="visual-character-group"><b>表演与调度</b><div className="visual-spec-fields">{field("画面位置",character.position,(value)=>patchCharacter(index,"position",value))}{field("身体姿态",character.bodyPose||"",v=>patchCharacter(index,"bodyPose",v))}{field("身体支持物",character.bodySupport||"",v=>patchCharacter(index,"bodySupport",v))}{field("动作",character.action,(value)=>patchCharacter(index,"action",value))}{field("动作对象",character.actionTarget,(value)=>patchCharacter(index,"actionTarget",value))}{field("表情",character.expression,(value)=>patchCharacter(index,"expression",value))}{field("视线",character.gazeTarget,(value)=>patchCharacter(index,"gazeTarget",value))}{field("手部状态",character.hands,(value)=>patchCharacter(index,"hands",value))}</div></div><div className="visual-character-group appearance"><b>连续性状态</b><div className="visual-spec-fields">{field("当前发型",character.appearanceState.hair,(value)=>patchAppearance(index,"hair",value))}{field("包",character.appearanceState.bag,(value)=>patchAppearance(index,"bag",value))}{field("首饰 / 配件",character.appearanceState.accessories.join(", "),(value)=>patchAppearance(index,"accessories",value.split(",").map(x=>x.trim()).filter(Boolean)))}{field("眼镜",character.appearanceState.glasses,(value)=>patchAppearance(index,"glasses",value))}{field("外套状态",character.appearanceState.outerwearState,(value)=>patchAppearance(index,"outerwearState",value))}{field("湿润 / 污损 / 伤痕",character.appearanceState.condition.join(", "),(value)=>patchAppearance(index,"condition",value.split(",").map(x=>x.trim()).filter(Boolean)))}</div></div></fieldset>)}
      {!Array.isArray(draft.interactions)&&<p className="config-message">此规格使用旧版交互格式，仍可查看和编辑。重新分析后会补全结构化交互事实。</p>}
      {(draft.interactions||[]).map((relation,index)=><fieldset className="visual-character-card" key={`${relation.actorCharacterId}:${index}`}><legend>交互 · {relation.actorCharacterId} · {relation.visualFacts?.object.label||relation.propId}</legend>{relation.visualFacts?<div className="visual-spec-fields">
        {field("具体物体",relation.visualFacts.object.label,v=>patchInteraction(index,'object','label',v))}
        {field("道具组标识（共享物体使用同一值）",relation.visualFacts.object.instanceId,v=>patchInteraction(index,'object','instanceId',v))}
        <label className="visual-spec-field"><span>物体数量</span><input type="number" min={1} max={16} step={1} value={relation.visualFacts.object.count} onChange={e=>patchInteraction(index,'object','count',e.target.value)}/></label>
        {([['动作类型','actionId',['pick','place','open','close','operate_environment','write','tool','push','pull','hold','inspect','drink','carry','touch','read']],['当前阶段','phase',['anticipation','contact','follow_through']]] as const).map(([label,key,choices])=><label className="visual-spec-field" key={key}><span>{label}</span><select value={relation.visualFacts![key]} onChange={e=>patchInteraction(index,'root',key,e.target.value)}>{choices.map(v=><option key={v} value={v}>{choiceLabels[v]||v}</option>)}</select></label>)}
        <label className="visual-spec-field"><span>参与手</span><select value={relation.visualFacts.contact.hand} onChange={e=>patchInteraction(index,'contact','hand',e.target.value)}>{['left','right','both'].map(v=><option key={v} value={v}>{choiceLabels[v]||v}</option>)}</select></label>
        {field("接触部位",relation.visualFacts.contact.part,v=>patchInteraction(index,'contact','part',v))}
        <label className="visual-spec-field"><span>接触状态</span><select value={relation.visualFacts.contact.state} onChange={e=>patchInteraction(index,'contact','state',e.target.value)}>{['approach','contact','released'].map(v=><option key={v} value={v}>{choiceLabels[v]||v}</option>)}</select></label>
        {field("支持物",relation.visualFacts.support.label,v=>patchInteraction(index,'support','label',v))}
        <label className="visual-spec-field"><span>物体位置状态</span><select value={relation.visualFacts.support.state} onChange={e=>patchInteraction(index,'support','state',e.target.value)}>{['on_support','held','unspecified'].map(v=><option key={v} value={v}>{choiceLabels[v]||v}</option>)}</select></label>
        <label className="visual-spec-field"><span>视线目标类型</span><select value={relation.visualFacts.gaze.kind} onChange={e=>patchInteraction(index,'gaze','kind',e.target.value)}>{['object','character','independent'].map(v=><option key={v} value={v}>{choiceLabels[v]||v}</option>)}</select></label>
        {field("视线目标 ID",relation.visualFacts.gaze.targetId,v=>patchInteraction(index,'gaze','targetId',v))}
        {field("视线目标表面",relation.visualFacts.gaze.surface,v=>patchInteraction(index,'gaze','surface',v))}
        {relation.visualFacts.workTarget&&<>
          {field("工具作用对象 ID",relation.visualFacts.workTarget.instanceId,v=>patchInteraction(index,'workTarget','instanceId',v))}
          {field("作用表面",relation.visualFacts.workTarget.surface,v=>patchInteraction(index,'workTarget','surface',v))}
          {field("具体操作",relation.visualFacts.workTarget.operation,v=>patchInteraction(index,'workTarget','operation',v))}
        </>}
        {field("视线方向说明",relation.visualFacts.gaze.description,v=>patchInteraction(index,'gaze','description',v))}
        <small>事实来源：{Object.entries(relation.visualFacts.provenance).map(([key,value])=>`${key}: ${value?.source}`).join(' · ')}。保存时校验数量、阶段与目标的一致性。</small>
      </div>:<small>旧规格仍使用文本推断。点击“重新分析”可生成明确的交互事实。</small>}</fieldset>)}
      <section className="visual-spec-section composition-section"><div className="visual-spec-section-title"><span>03</span><div><b>镜头构图</b><small>描述主体在画面中的组织方式</small></div></div>{field("构图描述",draft.camera.composition,(value)=>setDraft({...draft,camera:{...draft.camera,composition:value}}))}</section>
      {draft.warnings.length>0&&<p className="config-message visual-spec-warning"><ScanSearch size={15}/> <span><b>需要注意</b>{draft.warnings.join("；")}</span></p>}{message&&<p className="config-message">{message}</p>}
      <div className="visual-spec-footer"><small>确认后，此规格将用于后续提示词编译</small><button className="primary" disabled={saving} onClick={()=>void save()}><Save size={14}/>{saving?"保存中…":"保存并确认规格"}</button></div>
    </div>}
  </details>;
}

type JobLogEntry = {
  time: string;
  level: "event" | "warning" | "error" | "output";
  message: string;
};
type SdRecipe = {
  phase?: "draft" | "final";
  model?: string;
  vae?: string;
  clipSkip?: number;
  sampler?: string;
  scheduler?: string;
  steps?: number;
  cfgScale?: number;
  width?: number;
  height?: number;
  seed?: number;
  actualSeed?: number;
  batchSize?: number;
  denoisingStrength?: number;
  prompt?: string;
  negativePrompt?: string;
  appearanceCoverage?: Array<{characterId:string;face:string;hair:string;outfit:string;detail:string}>;
  poseUsage?: {version:string;enabled:boolean;status:string};
  geometryPassAudit?: {status:string;reason:string;skipped:string[]};
  promptRequestTraces?: Array<{stage:string;characterId:string|null;relationId:string|null;prompt:string;negativePrompt:string;requestStatus:string;phase?:string;durationMs?:number}>;
  references?: Array<{
    role: string;
    assetId: string;
    name: string;
    path: string;
    module: string;
    model: string;
    weight: number;
  }>;
  generationSpec?: {
    promptPlan?: {version:string;factsHash:string;commonPrompt:string;characterPrompts:string[];errors:string[];audit:Array<{factId:string;source:string;requested:string;applied:string;reason:string}>};
    commonPrompt?: string;
    characterRegions?: Array<{
      characterName: string;
      side: string;
      prompt: string;
      assetWarnings: string[];
    }>;
    assetWarnings?: string[];
    poseControl?: { enabled?: boolean; kind?: string; source?: string; model?: string };
  };
};
function JobDetailsButton({ payload }: { payload: string }) {
  const [open, setOpen] = useState(false);
  let parsed: { recipe?: SdRecipe; prompt?: string; negativePrompt?: string } =
    {};
  try {
    parsed = JSON.parse(payload);
  } catch {}
  const recipe = parsed.recipe;
  return (
    <>
      <button onClick={() => setOpen(true)}>
        <Settings2 size={14} />
        任务详情
      </button>
      {open && (
        <div className="job-log-overlay" onMouseDown={() => setOpen(false)}>
          <section
            className="job-log-drawer job-detail-drawer"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <small>GENERATION RECIPE</small>
                <h2>Stable Diffusion 任务详情</h2>
                <p>以下是该任务创建时固化的实际请求参数</p>
              </div>
              <button onClick={() => setOpen(false)}>关闭</button>
            </header>
            <div className="job-detail-body">
              {recipe ? (
                <>
                  <dl className="recipe-grid">
                    <dt>Model</dt>
                    <dd>{recipe.model}</dd>
                    <dt>Phase</dt>
                    <dd>
                      {recipe.phase === "draft" ? "构图草稿" : "正式成品"}
                    </dd>
                    <dt>VAE</dt>
                    <dd>{recipe.vae}</dd>
                    <dt>Sampler</dt>
                    <dd>{recipe.sampler}</dd>
                    <dt>Schedule type</dt>
                    <dd>{recipe.scheduler}</dd>
                    <dt>Steps</dt>
                    <dd>{recipe.steps}</dd>
                    <dt>CFG scale</dt>
                    <dd>{recipe.cfgScale}</dd>
                    <dt>Size</dt>
                    <dd>
                      {recipe.width} × {recipe.height}
                    </dd>
                    <dt>Seed</dt>
                    <dd>{recipe.seed === -1 ? "Random (-1)" : recipe.seed}</dd>
                    <dt>Clip skip</dt>
                    <dd>{recipe.clipSkip}</dd>
                    <dt>Batch</dt>
                    <dd>{recipe.batchSize}</dd>
                    {recipe.denoisingStrength !== undefined && (
                      <>
                        <dt>Img2img denoise</dt>
                        <dd>{recipe.denoisingStrength}</dd>
                      </>
                    )}
                  </dl>
                  <h3>实际参考资产</h3>
                  <div className="recipe-references">
                    {recipe.references?.length ? (
                      recipe.references.map((reference) => (
                        <article key={`${reference.role}-${reference.assetId}`}>
                          <b>{reference.role}</b>
                          <span>
                            {reference.name} · {reference.assetId}
                          </span>
                          <code>
                            {reference.module} / {reference.model} / weight{" "}
                            {reference.weight}
                          </code>
                          <small>{reference.path}</small>
                        </article>
                      ))
                    ) : (
                      <p>未传入参考资产</p>
                    )}
                  </div>
                  {recipe.generationSpec && (
                    <>
                      {recipe.poseUsage && <p><b>骨架控制：{recipe.poseUsage.enabled ? "启用" : "用户关闭"}</b>{!recipe.poseUsage.enabled && " · 保留骨架，使用提示词与人物参考；骨架定位的局部精修和裁切停用。"}</p>}
                      {recipe.geometryPassAudit && <details><summary>本次跳过的骨架关联处理</summary><small>{recipe.geometryPassAudit.skipped.join(' · ')}</small></details>}
                      {recipe.generationSpec.promptPlan && (
                        <details>
                          <summary>提示词组织与来源</summary>
                          <p>公共场景</p>
                          <small>{recipe.generationSpec.promptPlan.commonPrompt}</small>
                          {recipe.generationSpec.promptPlan.characterPrompts.map((text,index)=>(
                            <p key={index}><b>{recipe.generationSpec?.characterRegions?.[index]?.characterName || `人物 ${index+1}`}</b><br/><small>{text}</small></p>
                          ))}
                          <details><summary>编译记录</summary>
                            {recipe.generationSpec.promptPlan.audit.map((entry,index)=>(<p key={index}><small>{entry.factId} · {entry.source} · {entry.reason}<br/>{entry.applied || "已合并或分流"}</small></p>))}
                          </details>
                          {recipe.appearanceCoverage?.map(c=><p key={c.characterId}><b>{c.characterId} · 外观约束范围</b><br/><small>{c.detail}</small></p>)}
                          {!!recipe.promptRequestTraces?.length && <details><summary>实际请求提示词</summary>
                            {recipe.promptRequestTraces.map((trace,index)=>(<p key={index}><b>{trace.phase === "draft" ? "草稿 · " : trace.phase === "final" ? "成品 · " : ""}{trace.stage} · {trace.requestStatus}{typeof trace.durationMs === "number" && Number.isFinite(trace.durationMs) ? ` · ${(trace.durationMs / 1000).toFixed(1)}秒` : ""}</b><br/><small>{trace.prompt}<br/>负向：{trace.negativePrompt}</small></p>))}
                          </details>}
                        </details>
                      )}
                      <h3>结构化多人规格</h3>
                      <div className="recipe-references">
                        <article>
                          <b>OpenPose</b>
                          <span>
                            {recipe.generationSpec.poseControl?.enabled
                              ? `${recipe.generationSpec.poseControl.kind} · ${recipe.generationSpec.poseControl.source}`
                              : "未启用"}
                          </span>
                          <code>{recipe.generationSpec.poseControl?.model || "无模型"}</code>
                        </article>
                        {recipe.generationSpec.characterRegions?.map((region) => (
                          <article key={`${region.side}-${region.characterName}`}>
                            <b>{region.side} · {region.characterName}</b>
                            <span>{region.assetWarnings.length ? region.assetWarnings.join("；") : "人物资产完整"}</span>
                            <small>{region.prompt}</small>
                          </article>
                        ))}
                      </div>
                      {!!recipe.generationSpec.assetWarnings?.length && (
                        <p className="legacy-recipe">资产文字兜底：{recipe.generationSpec.assetWarnings.join("；")}</p>
                      )}
                    </>
                  )}
                </>
              ) : (
                <p className="legacy-recipe">
                  这是旧任务，创建时尚未记录模型和采样参数；可查看当时保存的提示词。
                </p>
              )}
              <h3>Prompt</h3>
              <pre>{recipe?.prompt || parsed.prompt || "未记录"}</pre>
              <h3>Negative prompt</h3>
              <pre>
                {recipe?.negativePrompt || parsed.negativePrompt || "未记录"}
              </pre>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function JobLogButton({ jobId, running }: { jobId: number; running: boolean }) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<JobLogEntry[]>([]);
  const [updatedAt, setUpdatedAt] = useState("");
  useEffect(() => {
    if (!open) return;
    const load = async () => {
      const response = await fetch(`/api/job-log?jobId=${jobId}`, {
        cache: "no-store",
      });
      if (!response.ok) return;
      const result = (await response.json()) as {
        entries?: JobLogEntry[];
        updatedAt?: string;
      };
      setEntries(result.entries || []);
      setUpdatedAt(result.updatedAt || "");
    };
    void load();
    if (!running) return;
    const timer = window.setInterval(() => void load(), 2000);
    return () => window.clearInterval(timer);
  }, [jobId, open, running]);
  return (
    <>
      <button onClick={() => setOpen(true)}>
        <Eye size={14} />
        运行日志
      </button>
      {open && (
        <div className="job-log-overlay" onMouseDown={() => setOpen(false)}>
          <section
            className="job-log-drawer"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <small>CODEX CLI LOG</small>
                <h2>任务 #{jobId} 运行日志</h2>
                <p>
                  {running
                    ? "每 2 秒自动刷新"
                    : updatedAt
                      ? `最后更新 ${formatLocalDateTime(updatedAt)}`
                      : "日志尚未产生"}
                </p>
              </div>
              <button onClick={() => setOpen(false)}>关闭</button>
            </header>
            <div className="job-log-stream">
              {entries.length === 0 ? (
                <p className="log-empty">正在等待 CLI 输出……</p>
              ) : (
                entries.map((entry, index) => (
                  <article
                    className={`log-${entry.level}`}
                    key={`${index}-${entry.message.slice(0, 20)}`}
                  >
                    <i>
                      {entry.level === "error"
                        ? "错误"
                        : entry.level === "warning"
                          ? "警告"
                          : entry.level === "event"
                            ? "阶段"
                            : "输出"}
                    </i>
                    <div>
                      {entry.time && (
                        <time>{formatLocalDateTime(entry.time)}</time>
                      )}
                      <pre>{entry.message}</pre>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function TaskQueue({
  data,
  refresh,
  flash,
}: {
  data: StudioData;
  refresh: () => Promise<void>;
  flash: (message: string) => void;
}) {
  const [workingId, setWorkingId] = useState<number | null>(null);
  const [jobPage, setJobPage] = useState(1);
  const [jobResult, setJobResult] = useState<{
    items: StudioData["jobs"];
    page: number;
    pages: number;
    total: number;
    summary: Record<string, number>;
  }>({
    items: data.jobs,
    page: 1,
    pages: 1,
    total: data.jobs.length,
    summary: {},
  });
  const loadJobPage = async (page = jobPage) => {
    const response = await fetch(
      `/api/jobs?projectId=${data.project.id}&page=${page}&pageSize=20`,
      { cache: "no-store" },
    );
    if (response.ok) setJobResult(await response.json());
  };
  useEffect(() => {
    setJobPage(1);
    void loadJobPage(1);
  }, [data.project.id]);
  const running = data.jobs.some((job) =>
    [
      "queued",
      "running",
      "draft_queued",
      "draft_running",
      "final_queued",
      "final_running",
      "codex_queued",
      "running_codex",
    ].includes(job.status),
  );
  useEffect(() => {
    if (!running) return;
    const sync = async () => {
      if (
        data.jobs.some(
          (job) =>
            job.provider === "sd-webui" &&
            ["running", "draft_running", "final_running"].includes(job.status),
        )
      )
        await fetch("/api/generation-progress", { cache: "no-store" }).catch(
          () => null,
        );
      await refresh();
      await loadJobPage();
    };
    const timer = window.setInterval(() => void sync(), 2500);
    return () => window.clearInterval(timer);
  }, [running, refresh, data.jobs]);
  const act = async (action: "pause" | "resume" | "retry", jobId: number) => {
    setWorkingId(jobId);
    const response = await fetch("/api/generation-progress", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, jobId, projectId: data.project.id }),
    });
    const result = await response.json();
    setWorkingId(null);
    if (!response.ok) {
      flash(result.error ?? "任务操作失败");
      return;
    }
    await refresh();
    await loadJobPage();
    flash(
      action === "pause"
        ? "任务已暂停"
        : action === "resume"
          ? "任务已恢复"
          : "已复制原配方并重新执行",
    );
  };
  const cancel = async (jobId: number) => {
    setWorkingId(jobId);
    const response = await fetch("/api/generation-progress", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jobId }),
    });
    const result = await response.json();
    setWorkingId(null);
    if (!response.ok) {
      flash(result.error ?? "取消失败");
      return;
    }
    await refresh();
    await loadJobPage();
    flash("任务已取消");
  };
  const startCodex = async (jobId: number) => {
    if (!confirm("确认使用 Codex 为这一格生成 1 张候选图吗？")) return;
    setWorkingId(jobId);
    const response = await fetch("/api/codex-executor", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: data.project.id,
        jobIds: [jobId],
        confirmed: true,
      }),
    });
    const result = await response.json();
    setWorkingId(null);
    if (!response.ok) {
      flash(result.error ?? "启动失败");
      return;
    }
    await refresh();
    await loadJobPage();
    flash("该格 Codex 生图已启动");
  };
  const label: Record<string, string> = {
    queued: "排队中",
    running: "生成中",
    draft_queued: "草稿排队",
    draft_running: "草稿生成中",
    final_queued: "成品排队",
    final_running: "成品生成中",
    awaiting_draft_approval: "待视觉质检确认",
    awaiting_final_approval: "待最终图片复核",
    draft_blocked: "视觉质检阻断",
    draft_rejected: "草稿已放弃",
    final_rejected: "最终图片未通过",
    paused: "已暂停",
    codex_queued: "Codex排队",
    running_codex: "Codex生成中",
    completed: "已完成",
    completed_low_confidence: "已完成 · 自动质检未通过",
    failed: "失败",
    awaiting_codex: "等待确认",
  };
  return (
    <>
      <div className="page-title row">
        <div>
          <small>TASK QUEUE</small>
          <h1>任务队列</h1>
          <p>Codex 任务逐格确认、逐格生成；其余任务保持等待，不会自动连跑。</p>
        </div>
        <div className="queue-actions">
          <button onClick={() => void Promise.all([refresh(), loadJobPage()])}>
            <RefreshCw size={15} />
            刷新
          </button>
        </div>
      </div>
      <div className="queue-summary">
        <article>
          <span>运行中</span>
          <b>
            {[
              "queued",
              "running",
              "draft_queued",
              "draft_running",
              "final_queued",
              "final_running",
              "codex_queued",
              "running_codex",
            ].reduce(
              (sum, status) => sum + (jobResult.summary[status] || 0),
              0,
            )}
          </b>
        </article>
        <article>
          <span>已暂停</span>
          <b>{jobResult.summary.paused || 0}</b>
        </article>
        <article>
          <span>已完成</span>
          <b>{jobResult.summary.completed || 0}</b>
        </article>
        <article>
          <span>失败</span>
          <b>{jobResult.summary.failed || 0}</b>
        </article>
      </div>
      <section className="queue-list">
        {jobResult.items.length === 0 ? (
          <div className="queue-empty">
            <Clock3 />
            <h3>还没有任务</h3>
          </div>
        ) : (
          jobResult.items.map((job) => {
            let actualSeed: string | number = "";
            try {
              const recipe = (JSON.parse(job.payload) as { recipe?: SdRecipe })
                .recipe;
              actualSeed = Number.isFinite(recipe?.actualSeed)
                ? recipe!.actualSeed!
                : "";
            } catch {}
            const controllable = [
              "queued",
              "running",
              "draft_queued",
              "draft_running",
              "final_queued",
              "final_running",
              "codex_queued",
              "running_codex",
            ].includes(job.status);
            const cancelable = [
              ...["queued", "running", "codex_queued", "running_codex"],
              "draft_queued",
              "draft_running",
              "final_queued",
              "final_running",
              "awaiting_codex",
            ].includes(job.status);
            return (
              <article key={job.id}>
                <div className={`queue-status status-${job.status}`}>
                  <i />
                  {label[job.status] ?? job.status}
                </div>
                <div>
                  <small>
                    {job.provider === "codex"
                      ? "CODEX IMAGE"
                      : "STABLE DIFFUSION"}
                  </small>
                  <div className="job-story-path">
                    {job.projectTitle || data.project.title} /{" "}
                    {job.episodeTitle || "未知章节"} / 任务 #{job.id}
                  </div>
                  <h3>
                    第 {job.pageNumber} 页 · 第 {job.shotPosition} 格 ·{" "}
                    {job.shotTitle}
                  </h3>
                  <p>
                    {job.error ||
                      job.stage ||
                      `任务 #${job.id} · ${formatLocalDateTime(job.createdAt)}`}
                  </p>
                  {actualSeed !== "" && <code>Actual Seed: {actualSeed}</code>}
                </div>
                <div className="queue-row-action">
                  <b>
                    {["running", "draft_running", "final_running"].includes(
                      job.status,
                    )
                      ? `${Math.round(job.progress)}%`
                      : ""}
                  </b>
                  {job.status === "awaiting_codex" && (
                    <button
                      className="primary"
                      disabled={workingId === job.id}
                      onClick={() => void startCodex(job.id)}
                    >
                      <Sparkles size={13} />
                      {workingId === job.id ? "正在启动" : "确认并生成此图"}
                    </button>
                  )}
                  {job.provider === "sd-webui" && (
                    <JobDetailsButton payload={job.payload} />
                  )}{" "}
                  {job.provider === "codex" && (
                    <JobLogButton
                      jobId={job.id}
                      running={job.status === "running_codex"}
                    />
                  )}{" "}
                  {controllable && (
                    <button
                      disabled={workingId === job.id}
                      onClick={() => void act("pause", job.id)}
                    >
                      暂停
                    </button>
                  )}
                  {job.status === "paused" && (
                    <button
                      disabled={workingId === job.id}
                      onClick={() => void act("resume", job.id)}
                    >
                      恢复
                    </button>
                  )}
                  {job.status === "failed" && (
                    <button
                      disabled={workingId === job.id}
                      onClick={() => void act("retry", job.id)}
                    >
                      按原配方重试
                    </button>
                  )}
                  {cancelable && (
                    <button
                      disabled={workingId === job.id}
                      onClick={() => void cancel(job.id)}
                    >
                      取消
                    </button>
                  )}
                </div>
              </article>
            );
          })
        )}
      </section>
      <nav className="queue-pagination" aria-label="任务分页">
        <button
          disabled={jobResult.page <= 1}
          onClick={() => {
            const page = jobResult.page - 1;
            setJobPage(page);
            void loadJobPage(page);
          }}
        >
          上一页
        </button>
        <span>
          第 {jobResult.page} / {jobResult.pages} 页 · 共 {jobResult.total}{" "}
          个任务
        </span>
        <button
          disabled={jobResult.page >= jobResult.pages}
          onClick={() => {
            const page = jobResult.page + 1;
            setJobPage(page);
            void loadJobPage(page);
          }}
        >
          下一页
        </button>
      </nav>
    </>
  );
}

function TaskQueueLegacy({
  data,
  refresh,
  flash,
}: {
  data: StudioData;
  refresh: () => Promise<void>;
  flash: (message: string) => void;
}) {
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [startingCodex, setStartingCodex] = useState(false);
  const [retryingId, setRetryingId] = useState<number | null>(null);
  const running = data.jobs.some((job) =>
    ["queued", "running", "codex_queued", "running_codex"].includes(job.status),
  );
  useEffect(() => {
    if (!running) return;
    const sync = async () => {
      await fetch("/api/generation-progress", { cache: "no-store" }).catch(
        () => null,
      );
      await refresh();
    };
    void sync();
    const timer = window.setInterval(() => void sync(), 3000);
    return () => window.clearInterval(timer);
  }, [running, refresh]);
  const cancel = async (jobId: number) => {
    setCancellingId(jobId);
    const response = await fetch("/api/generation-progress", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jobId }),
    });
    const result = await response.json();
    setCancellingId(null);
    if (!response.ok) {
      flash(result.error ?? "取消任务失败");
      return;
    }
    await refresh();
    flash("该任务已取消");
  };
  const copyCodexCommand = async () => {
    const waiting = data.jobs.filter((job) => job.status === "awaiting_codex");
    const pages = [...new Set(waiting.map((job) => job.pageNumber))].sort(
      (a, b) => a - b,
    );
    const command = `确认处理漫画工作台项目「${data.project.title}」的 Codex 生图队列：第 ${pages.join("、")} 页，共 ${waiting.length} 格；每格生成 2 个候选并回写对应分格，不覆盖已锁定版本。`;
    await navigator.clipboard.writeText(command);
    flash("处理指令已复制，请粘贴到当前 Codex 对话并发送");
  };
  const startCodex = async () => {
    const waiting = data.jobs.filter((job) => job.status === "awaiting_codex");
    if (waiting.length === 0) return;
    if (
      !confirm(
        `将通过 Codex CLI 处理 ${waiting.length} 格，每格生成 2 个候选。此操作会消耗 Codex 图片生成额度，确认启动吗？`,
      )
    )
      return;
    setStartingCodex(true);
    const response = await fetch("/api/codex-executor", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: data.project.id,
        jobIds: waiting.map((job) => job.id),
        confirmed: true,
      }),
    });
    const result = await response.json();
    setStartingCodex(false);
    if (!response.ok) {
      flash(result.error ?? "Codex CLI 启动失败");
      return;
    }
    await refresh();
    flash(`Codex CLI 已启动，正在处理 ${result.jobIds.length} 格`);
  };
  const retryCodex = async (jobId: number) => {
    setRetryingId(jobId);
    const response = await fetch("/api/studio", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "retryCodexJob",
        jobId,
        projectId: data.project.id,
      }),
    });
    const result = await response.json();
    setRetryingId(null);
    if (!response.ok) {
      flash(result.error ?? "重试失败");
      return;
    }
    await refresh();
    flash("已复制原任务配方并重新加入 Codex 队列");
  };
  const statusLabel: Record<string, string> = {
    queued: "排队中",
    running: "生成中",
    codex_queued: "Codex排队中",
    running_codex: "Codex生成中",
    completed: "已完成",
    completed_low_confidence: "已完成 · 自动质检未通过",
    failed: "失败",
    awaiting_codex: "等待 Codex 处理",
  };
  const waitingCount = data.jobs.filter(
    (job) => job.status === "awaiting_codex",
  ).length;
  return (
    <>
      <div className="page-title row">
        <div>
          <small>TASK QUEUE</small>
          <h1>任务队列</h1>
          <p>
            仅展示数据库中的真实任务。取消后任务会从列表移除；失败任务保留用于排查原因。
          </p>
        </div>
        <div className="queue-actions">
          {waitingCount > 0 && (
            <>
              <button
                className="primary"
                disabled={startingCodex}
                onClick={startCodex}
              >
                <Sparkles size={15} />
                {startingCodex ? "正在启动" : "确认并启动 Codex CLI"}
              </button>
              <button onClick={copyCodexCommand}>
                <Copy size={15} />
                复制备用指令
              </button>
            </>
          )}
          <button onClick={() => void refresh()}>
            <RefreshCw size={15} />
            刷新
          </button>
        </div>
      </div>
      {waitingCount > 0 && (
        <section className="codex-guide">
          <div>
            <i>1</i>
            <span>网站已准备提示词与参考图</span>
          </div>
          <ChevronRight />
          <div>
            <i>2</i>
            <span>确认一次后启动本机 Codex CLI</span>
          </div>
          <ChevronRight />
          <div>
            <i>3</i>
            <span>生成完成后自动回写候选图</span>
          </div>
        </section>
      )}
      <div className="queue-summary">
        <article>
          <span>运行中</span>
          <b>
            {
              data.jobs.filter((job) =>
                ["queued", "running", "codex_queued", "running_codex"].includes(
                  job.status,
                ),
              ).length
            }
          </b>
        </article>
        <article>
          <span>等待 Codex</span>
          <b>{waitingCount}</b>
        </article>
        <article>
          <span>已完成</span>
          <b>{data.jobs.filter((job) => job.status === "completed").length}</b>
        </article>
        <article>
          <span>失败</span>
          <b>{data.jobs.filter((job) => job.status === "failed").length}</b>
        </article>
      </div>
      <section className="queue-list">
        {data.jobs.length === 0 ? (
          <div className="queue-empty">
            <Clock3 />
            <h3>还没有任务</h3>
            <p>在单格制作中生成候选，或将当前页加入 Codex 队列。</p>
          </div>
        ) : (
          data.jobs.map((job) => (
            <article key={job.id}>
              <div className={`queue-status status-${job.status}`}>
                <i />
                {statusLabel[job.status] ?? job.status}
              </div>
              <div>
                <small>
                  {job.provider === "codex"
                    ? "CODEX IMAGE"
                    : "STABLE DIFFUSION"}
                </small>
                <h3>
                  第 {job.pageNumber} 页 · 第 {job.shotPosition} 格 ·{" "}
                  {job.shotTitle}
                </h3>
                <p>
                  {job.error ||
                    (job.status === "awaiting_codex"
                      ? "任务资料已就绪；点击页面顶部按钮，确认一次即可启动"
                      : job.status === "running_codex"
                        ? job.stage ||
                          "Codex CLI 正在使用角色与服装参考图生成候选"
                        : `任务 #${job.id} · 创建于 ${formatLocalDateTime(job.createdAt)}`)}
                </p>
              </div>
              <div className="queue-row-action">
                <b>
                  {job.status === "running"
                    ? `${Math.round(job.progress)}%`
                    : job.status === "running_codex"
                      ? "处理中"
                      : ""}
                </b>
                {job.provider === "sd-webui" && (
                  <JobDetailsButton payload={job.payload} />
                )}{" "}
                {job.provider === "codex" && (
                  <JobLogButton
                    jobId={job.id}
                    running={job.status === "running_codex"}
                  />
                )}{" "}
                {job.provider === "codex" && job.status === "failed" && (
                  <button
                    disabled={retryingId === job.id}
                    onClick={() => retryCodex(job.id)}
                  >
                    <RefreshCw size={13} />
                    {retryingId === job.id ? "正在复制" : "按原配方重试"}
                  </button>
                )}{" "}
                {["queued", "running", "awaiting_codex"].includes(
                  job.status,
                ) && (
                  <button
                    disabled={cancellingId === job.id}
                    onClick={() => cancel(job.id)}
                  >
                    {cancellingId === job.id
                      ? "处理中"
                      : job.status === "running"
                        ? "停止此任务"
                        : "取消此任务"}
                  </button>
                )}
              </div>
            </article>
          ))
        )}
      </section>
    </>
  );
}

function GenerationSettings() {
  type ConfigStatus = {
    provider: string | null;
    url: string;
    configured: boolean;
    reachable: boolean;
    apiEnabled: boolean;
    controlNet: boolean;
    ipAdapter: boolean;
    code: string;
    message: string;
    envFile: string;
    deepseek: {enabled:boolean;baseUrl:string;model:string;apiKeyConfigured:boolean;apiKeyLast4:string};
  };
  const [status, setStatus] = useState<ConfigStatus | null>(null);
  const [deepseek,setDeepseek]=useState({enabled:false,baseUrl:"https://api.deepseek.com",model:"deepseek-v4-pro",apiKey:""});
  const [customModel,setCustomModel]=useState(false);
  const [configBusy,setConfigBusy]=useState("");
  const [configMessage,setConfigMessage]=useState("");
  const detect = () =>
    fetch("/api/config", { cache: "no-store" })
      .then((response) => response.json())
      .then((value)=>{setStatus(value);if(value.deepseek){setDeepseek((current)=>({...current,enabled:value.deepseek.enabled,baseUrl:value.deepseek.baseUrl,model:value.deepseek.model}));setCustomModel(!["deepseek-v4-pro","deepseek-v4-flash"].includes(value.deepseek.model));}}); 
  useEffect(() => {
    detect();
  }, []);
  const label = !status
    ? "正在检测"
    : status.code === "CONNECTED"
      ? "已连接"
      : status.code === "NOT_CONFIGURED"
        ? "尚未配置"
        : status.code === "API_DISABLED"
          ? "API 未开启"
          : "地址无法连接";
  const saveDeepseek=async()=>{setConfigBusy("save");setConfigMessage("");try{const response=await fetch("/api/config",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify(deepseek)});const result=await response.json();if(!response.ok)throw new Error(result.error);setDeepseek((x)=>({...x,apiKey:""}));setConfigMessage("DeepSeek 配置已安全保存。");await detect();}catch(error){setConfigMessage(error instanceof Error?error.message:"保存失败");}finally{setConfigBusy("");}};
  const testDeepseek=async()=>{setConfigBusy("test");setConfigMessage("");try{const response=await fetch("/api/config",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"test-deepseek",...deepseek})});const result=await response.json();if(!response.ok)throw new Error(result.error);setConfigMessage(`连接成功 · ${result.model} · ${result.latencyMs}ms · ${formatLocalDateTime(result.testedAt)}`);}catch(error){setConfigMessage(error instanceof Error?error.message:"测试失败");}finally{setConfigBusy("");}};
  const removeDeepseek=async()=>{setConfigBusy("delete");await fetch("/api/config",{method:"DELETE"});setConfigMessage("DeepSeek 密钥已删除。");await detect();setConfigBusy("");};
  return (
    <>
      <div className="page-title">
        <small>GENERATION SETTINGS</small>
        <h1>AI 生成服务</h1>
        <p>Stable Diffusion 在本机生成图片；启用 DeepSeek 后，剧情文字和资产文字描述会发送到你配置的 API，角色图片不会上传。</p>
      </div>
      <div className="settings-grid">
        <section>
          <h2>Stable Diffusion WebUI</h2>
          <div
            className={`provider-status ${status?.code === "CONNECTED" ? "online" : ""}`}
          >
            <i />
            {label}
          </div>
          {status && (
            <p
              className={`config-message ${status.code === "CONNECTED" ? "ok" : ""}`}
            >
              {status.message}
            </p>
          )}
          <dl>
            <dt>适配器</dt>
            <dd>{status?.provider ?? "未设置"}</dd>
            <dt>服务地址</dt>
            <dd>
              <code>{status?.url ?? "读取中…"}</code>
            </dd>
            <dt>API</dt>
            <dd>{status?.apiEnabled ? "可用" : "不可用"}</dd>
            <dt>ControlNet</dt>
            <dd>{status?.controlNet ? "已检测到" : "未检测到"}</dd>
            <dt>IP-Adapter</dt>
            <dd>{status?.ipAdapter ? "已检测到" : "未检测到"}</dd>
            <dt>配置文件</dt>
            <dd>
              <code>{status?.envFile ?? "读取中…"}</code>
            </dd>
          </dl>
          <button onClick={detect}>
            <RefreshCw size={14} />
            重新检测
          </button>
        </section>
        <section>
          <h2>配置方法</h2>
          <p>
            在漫画工作台根目录创建 <code>.env.local</code>：
          </p>
          <pre>
            IMAGE_PROVIDER=sd-webui{"\n"}SD_WEBUI_URL=http://127.0.0.1:7860
          </pre>
          <ol>
            <li>
              使用 <code>--api</code> 参数启动 Stable Diffusion WebUI。
            </li>
            <li>修改配置后重启漫画制作台，仅刷新页面不会加载新环境变量。</li>
            <li>回到这里确认API状态为“可用”。</li>
            <li>
              ControlNet/IP-Adapter缺失时仍可测试基础生成，但角色一致性能力会受限。
            </li>
          </ol>
          <p className="settings-note">
            未连接模型时仍可编辑完整英文提示词，并导入外部生成的候选图。
          </p>
        </section>
        <section className="deepseek-settings">
          <div className="deepseek-heading">
            <div>
              <span className="settings-eyebrow">TEXT INTELLIGENCE</span>
              <h2>DeepSeek 剧情分析模型</h2>
              <p>用于全章视觉规划和单镜头细化，让画面信息与剧情保持一致。</p>
            </div>
            <div className={`provider-status ${status?.deepseek.enabled&&status.deepseek.apiKeyConfigured?"online":""}`}><i/>{status?.deepseek.apiKeyConfigured?status.deepseek.enabled?"已配置并启用":"已配置但未启用":"尚未配置"}</div>
          </div>
          <label className="deepseek-toggle">
            <span><b>启用剧情分析</b><small>在规划章节和细化镜头时调用当前模型</small></span>
            <span className="switch-control"><input type="checkbox" checked={deepseek.enabled} onChange={(e)=>setDeepseek({...deepseek,enabled:e.target.checked})}/><i /></span>
          </label>
          <div className="deepseek-fields">
            <label><span>API 地址</span><small>兼容 OpenAI Chat Completions 的服务地址</small><input value={deepseek.baseUrl} spellCheck={false} onChange={(e)=>setDeepseek({...deepseek,baseUrl:e.target.value})}/></label>
            <label><span>模型</span><small>选择速度与分析能力的平衡</small><select value={customModel?"custom":deepseek.model} onChange={(e)=>{const custom=e.target.value==="custom";setCustomModel(custom);if(!custom)setDeepseek({...deepseek,model:e.target.value});}}><option value="deepseek-v4-pro">deepseek-v4-pro</option><option value="deepseek-v4-flash">deepseek-v4-flash</option><option value="custom">自定义模型</option></select></label>
            {customModel&&<label><span>自定义模型名</span><small>填写服务端实际提供的模型标识</small><input value={deepseek.model} placeholder="例如 deepseek-chat" onChange={(e)=>setDeepseek({...deepseek,model:e.target.value})}/></label>}
            <label className={customModel?"":"wide"}><span>API Key</span><small>{status?.deepseek.apiKeyConfigured?"留空将继续使用已安全保存的密钥":"密钥仅保存在这台电脑上"}</small><input type="password" autoComplete="new-password" value={deepseek.apiKey} placeholder={status?.deepseek.apiKeyConfigured?`已配置 ····${status.deepseek.apiKeyLast4}`:"输入 DeepSeek API Key"} onChange={(e)=>setDeepseek({...deepseek,apiKey:e.target.value})}/></label>
          </div>
          <div className="deepseek-security"><Lock size={16}/><p><b>本机加密保存</b><span>密钥使用当前 Windows 用户级 DPAPI 加密；仅发送剧情文本和结构化资产描述，不上传角色图片。</span></p></div>
          {configMessage&&<p className="config-message deepseek-message">{configMessage}</p>}
          <div className="deepseek-actions">
            <button className="primary" disabled={Boolean(configBusy)} onClick={()=>void saveDeepseek()}><Save size={15}/>{configBusy==="save"?"保存中…":"保存配置"}</button>
            <button disabled={Boolean(configBusy)||(!deepseek.apiKey&&!status?.deepseek.apiKeyConfigured)} onClick={()=>void testDeepseek()}>{configBusy==="test"?"测试中…":"测试连接"}</button>
            <button className="danger" disabled={Boolean(configBusy)||!status?.deepseek.apiKeyConfigured} onClick={()=>void removeDeepseek()}><Trash2 size={15}/>删除密钥</button>
          </div>
        </section>
      </div>
    </>
  );
}
