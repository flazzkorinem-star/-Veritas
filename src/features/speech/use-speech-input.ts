import { useEffect, useRef, useState } from "react";

export interface SpeechRecognitionResultEvent {
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      0: { transcript: string };
    };
  };
}

export interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

export type SpeechRecognitionFactory = () => SpeechRecognitionLike | null;
export type SpeechInputState = "IDLE" | "STARTING" | "LISTENING" | "STOPPING";

function browserRecognition(): SpeechRecognitionLike | null {
  if (typeof window === "undefined") return null;
  const browser = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  const Recognition = browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
  return Recognition ? new Recognition() : null;
}

function speechError(code: string) {
  if (code === "not-allowed" || code === "service-not-allowed") {
    return "没有获得麦克风权限，请允许访问后重试；文字输入仍可使用。";
  }
  if (code === "no-speech") {
    return "没有听到清晰语音，请靠近麦克风后重试；已有文字已保留。";
  }
  if (code === "audio-capture") {
    return "找不到可用的麦克风，请检查设备后重试；文字输入仍可使用。";
  }
  if (code === "aborted") {
    return "语音输入已中断，已经写下的文字仍然保留。";
  }
  return "语音识别暂时失败，请重试或继续使用文字输入。";
}

function release(recognition: SpeechRecognitionLike) {
  recognition.onstart = null;
  recognition.onresult = null;
  recognition.onerror = null;
  recognition.onend = null;
}

export function useSpeechInput(
  onTranscript: (value: string) => void,
  factory: SpeechRecognitionFactory = browserRecognition,
) {
  const [state, setState] = useState<SpeechInputState>("IDLE");
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const transcriptHandler = useRef(onTranscript);

  useEffect(() => {
    transcriptHandler.current = onTranscript;
  }, [onTranscript]);

  useEffect(
    () => () => {
      const recognition = recognitionRef.current;
      if (!recognition) return;
      recognition.abort();
      release(recognition);
      recognitionRef.current = null;
    },
    [],
  );

  function toggle(baseDraft: string) {
    const active = recognitionRef.current;
    if (active) {
      setState("STOPPING");
      active.stop();
      return;
    }

    setError(null);
    const recognition = factory();
    if (!recognition) {
      setError("当前浏览器不支持语音输入，请继续使用文字回答。");
      return;
    }
    recognitionRef.current = recognition;
    recognition.lang = "zh-CN";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => setState("LISTENING");
    recognition.onresult = (event) => {
      let transcript = "";
      for (let index = 0; index < event.results.length; index += 1) {
        transcript += event.results[index]?.[0]?.transcript ?? "";
      }
      const spoken = transcript.trim();
      if (!spoken) return;
      transcriptHandler.current(
        baseDraft.trim() ? `${baseDraft.trimEnd()}\n${spoken}` : spoken,
      );
    };
    recognition.onerror = (event) => {
      setError(speechError(event.error));
      setState("IDLE");
      recognitionRef.current = null;
      release(recognition);
    };
    recognition.onend = () => {
      setState("IDLE");
      recognitionRef.current = null;
      release(recognition);
    };
    try {
      setState("STARTING");
      recognition.start();
    } catch {
      recognitionRef.current = null;
      release(recognition);
      setState("IDLE");
      setError("无法开始语音输入，请重试或继续使用文字回答。");
    }
  }

  return { state, error, toggle };
}
