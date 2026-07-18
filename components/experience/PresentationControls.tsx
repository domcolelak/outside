"use client";

import { useEffect, useRef, useState } from "react";

type CaptureState = "idle" | "capturing" | "recording" | "saving" | "error";

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename; document.body.appendChild(anchor); anchor.click(); anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function PresentationControls({ name = "outside", onPresent, className = "" }: { name?: string; onPresent?: () => void; className?: string }) {
  const [clean, setClean] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const [state, setState] = useState<CaptureState>("idle");
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);

  useEffect(() => {
    document.body.dataset.captureMode = clean ? "clean" : "";
    return () => { delete document.body.dataset.captureMode; stream.current?.getTracks().forEach((track) => track.stop()); };
  }, [clean]);
  useEffect(() => {
    const update = () => {
      const fullscreen = !!document.fullscreenElement;
      if (!fullscreen) delete document.body.dataset.presenterMode;
      setPresenting(fullscreen);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setClean(false);
    };
    document.addEventListener("fullscreenchange", update);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("fullscreenchange", update);
      document.removeEventListener("keydown", onKeyDown);
      delete document.body.dataset.presenterMode;
    };
  }, []);

  const present = async () => {
    onPresent?.();
    document.body.dataset.presenterMode = "true";
    setPresenting(true);
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen().catch(() => undefined);
  };
  const exitPresentation = async () => {
    delete document.body.dataset.presenterMode;
    setClean(false);
    setPresenting(false);
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
  };
  const getScreen = async () => navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: "browser", frameRate: 30 }, audio: false });
  const capture = async () => {
    setState("capturing"); setClean(true);
    try {
      const media = await getScreen();
      const video = document.createElement("video"); video.srcObject = media; video.muted = true; await video.play();
      await new Promise((resolve) => window.setTimeout(resolve, 250));
      const canvas = document.createElement("canvas"); canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      canvas.getContext("2d")?.drawImage(video, 0, 0);
      media.getTracks().forEach((track) => track.stop()); video.srcObject = null;
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png", 1));
      if (!blob) throw new Error("Unable to encode capture");
      download(blob, `${name}-presentation.png`); setState("idle"); setClean(false);
    } catch (error) { setState(error instanceof DOMException && error.name === "NotAllowedError" ? "idle" : "error"); setClean(false); }
  };
  const toggleRecording = async () => {
    if (state === "recording") { setState("saving"); recorder.current?.stop(); return; }
    try {
      const media = await getScreen(); stream.current = media; chunks.current = [];
      const type = MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : "video/webm";
      const next = new MediaRecorder(media, { mimeType: type, videoBitsPerSecond: 8_000_000 }); recorder.current = next;
      next.ondataavailable = (event) => { if (event.data.size) chunks.current.push(event.data); };
      next.onstop = () => { download(new Blob(chunks.current, { type }), `${name}-demo.webm`); media.getTracks().forEach((track) => track.stop()); stream.current = null; setClean(false); setState("idle"); };
      media.getVideoTracks()[0]?.addEventListener("ended", () => { if (next.state !== "inactive") next.stop(); });
      next.start(1_000); setClean(true); setState("recording");
    } catch (error) { setState(error instanceof DOMException && error.name === "NotAllowedError" ? "idle" : "error"); setClean(false); }
  };

  return <div data-presentation-controls className={`flex items-center gap-1 rounded-xl border border-line bg-base-950/80 p-1 shadow-panel backdrop-blur-xl ${className}`}>
    <Action label="Present" title="Fullscreen presenter mode" onClick={() => void present()} icon="▶" />
    <Action label={clean ? "Restore UI" : "Clean frame"} title="Hide non-essential interface for screenshots" onClick={() => setClean((value) => !value)} icon={clean ? "◫" : "□"} active={clean}/>
    <Action label={state === "capturing" ? "Capturing" : "Capture"} title="Capture the selected browser surface as PNG" onClick={() => void capture()} icon="⌁" disabled={state !== "idle"}/>
    <Action label={state === "recording" ? "Stop" : state === "saving" ? "Saving" : "Record"} title="Record a polished browser-surface walkthrough" onClick={() => void toggleRecording()} icon={state === "recording" ? "■" : "●"} active={state === "recording"} disabled={state === "capturing" || state === "saving"}/>
    {presenting && <Action label="Exit" title="Exit presenter mode" onClick={() => void exitPresentation()} icon="×"/>}
    {state === "error" && <button onClick={() => setState("idle")} className="mono px-2 text-[9px] text-risk-high">Capture failed</button>}
  </div>;
}

function Action({ label, title, icon, onClick, active = false, disabled = false }: { label: string; title: string; icon: string; onClick: () => void; active?: boolean; disabled?: boolean }) {
  return <button type="button" title={title} onClick={onClick} disabled={disabled} className={`group flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[10px] transition disabled:opacity-40 ${active ? "bg-signal/12 text-signal" : "text-ink-faint hover:bg-base-800 hover:text-ink"}`}><span className={`mono ${active ? "animate-pulse" : ""}`}>{icon}</span><span className="hidden xl:inline">{label}</span></button>;
}
