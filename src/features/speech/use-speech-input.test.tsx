import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  useSpeechInput,
  type SpeechRecognitionLike,
  type SpeechRecognitionResultEvent,
} from "./use-speech-input";

function recognition(): SpeechRecognitionLike {
  return {
    lang: "",
    continuous: true,
    interimResults: false,
    maxAlternatives: 2,
    onstart: null,
    onresult: null,
    onerror: null,
    onend: null,
    start: vi.fn(),
    stop: vi.fn(),
    abort: vi.fn(),
  };
}

function resultEvent(text: string, isFinal = true): SpeechRecognitionResultEvent {
  return {
    results: { 0: { 0: { transcript: text }, isFinal }, length: 1 },
  };
}

describe("浏览器语音输入", () => {
  it("默认使用中文单次识别，并把转写追加到已有草稿", () => {
    const instance = recognition();
    const onTranscript = vi.fn();
    const { result } = renderHook(() => useSpeechInput(onTranscript, () => instance));

    act(() => result.current.toggle("已有草稿"));
    expect(instance).toMatchObject({
      lang: "zh-CN",
      continuous: false,
      interimResults: true,
      maxAlternatives: 1,
    });
    expect(instance.start).toHaveBeenCalledOnce();
    act(() => instance.onstart?.());
    expect(result.current.state).toBe("LISTENING");
    act(() => instance.onresult?.(resultEvent("太阳能驱动蒸发")));
    expect(onTranscript).toHaveBeenLastCalledWith("已有草稿\n太阳能驱动蒸发");

    act(() => result.current.toggle("已有草稿\n太阳能驱动蒸发"));
    expect(instance.stop).toHaveBeenCalledOnce();
    expect(result.current.state).toBe("STOPPING");
  });

  it.each([
    ["not-allowed", "没有获得麦克风权限"],
    ["no-speech", "没有听到清晰语音"],
    ["audio-capture", "找不到可用的麦克风"],
    ["network", "语音识别暂时失败"],
    ["aborted", "语音输入已中断"],
  ])("将 %s 转成明确提示并保留文字输入", (code, message) => {
    const instance = recognition();
    const { result } = renderHook(() => useSpeechInput(vi.fn(), () => instance));
    act(() => result.current.toggle("保留的文字"));
    act(() => instance.onerror?.({ error: code }));
    expect(result.current.error).toContain(message);
    expect(result.current.state).toBe("IDLE");
  });

  it("不支持 SpeechRecognition 时给出提示，且不会触碰草稿", () => {
    const onTranscript = vi.fn();
    const { result } = renderHook(() => useSpeechInput(onTranscript, () => null));
    act(() => result.current.toggle("文字回答"));
    expect(result.current.error).toContain("当前浏览器不支持语音输入");
    expect(onTranscript).not.toHaveBeenCalled();
  });

  it("组件卸载时中断识别并释放回调", () => {
    const instance = recognition();
    const { result, unmount } = renderHook(() => useSpeechInput(vi.fn(), () => instance));
    act(() => result.current.toggle(""));
    unmount();
    expect(instance.abort).toHaveBeenCalledOnce();
    expect(instance.onresult).toBeNull();
  });
});
