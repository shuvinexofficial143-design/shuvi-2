import { invoke } from "@tauri-apps/api/core";
import "./styles.css";
import { mountVideoStudio } from "./studios/video/view";

type EngineStatus = { name: string; sourcePinned: boolean; runtimeReady: boolean };

const title = document.querySelector<HTMLElement>("#studio-title")!;
const health = document.querySelector<HTMLElement>("#engine-health")!;
const output = document.querySelector<HTMLElement>("#test-output")!;
const thread = document.querySelector<HTMLElement>("#chat-thread")!;
const prompt = document.querySelector<HTMLTextAreaElement>("#prompt")!;

let selectedStudio: "video" | "motion" = "video";
const videoStudio = mountVideoStudio();
// Video is the default tab; hide the M0 placeholder immediately.
videoStudio.setActive(true);
let engines: EngineStatus[] = [];

function showHealth(): void {
  if (selectedStudio === "video") {
    health.textContent = "FilmCraft · click Verify Engine for real runtime check";
    return;
  }
  const found = engines.find((engine) => engine.name === selectedStudio);
  health.textContent = found?.runtimeReady
    ? "Engine ready"
    : found?.sourcePinned
      ? "Source pinned · Engine not built"
      : "Engine unavailable";
}
document.querySelectorAll<HTMLButtonElement>("button[data-studio]").forEach((button) => {
  button.addEventListener("click", () => {
    const next = button.dataset.studio;
    if (next !== "video" && next !== "motion") return;
    selectedStudio = next;
    title.textContent = next === "video" ? "Video Studio" : "Motion Studio";
    document.querySelectorAll("button[data-studio]").forEach((b) => b.classList.toggle("active", b === button));
    videoStudio.setActive(next === "video");
    showHealth();
  });
});

function appendMessage(role: "user" | "assistant", message: string): void {
  const element = document.createElement("div");
  element.className = "message " + role;
  element.textContent = message;
  thread.appendChild(element);
  thread.scrollTop = thread.scrollHeight;
}

document.querySelector<HTMLFormElement>("#chat-form")!.addEventListener("submit", (event) => {
  event.preventDefault();
  const value = prompt.value.trim();
  if (!value) return;
  appendMessage("user", value);
  appendMessage("assistant", selectedStudio === "video"
    ? videoStudio.proposeChatText(value)
    : "Draft saved only in this window. No AI provider or motion editing engine is connected; no edit executed.");
  prompt.value = "";
});

document.querySelector<HTMLButtonElement>("#srt-test")!.addEventListener("click", async () => {
  output.textContent = "Testing…";
  try {
    const captions = await invoke<string>("serialize_captions", {
      cues: [{ start: 0, end: 2.5, text: "Shuvi 2 native bridge is working." }],
    });
    output.textContent = captions.includes("00:00:02,500")
      ? "PASS · Rust subtitle serializer returned a valid cue"
      : "FAIL · Unexpected SRT output";
  } catch (error) {
    output.textContent = "Not available: " + String(error);
  }
});

async function initialize(): Promise<void> {
  try {
    engines = await invoke<EngineStatus[]>("engine_status");
  } catch {
    engines = [];
  }
  showHealth();
}
void initialize();
