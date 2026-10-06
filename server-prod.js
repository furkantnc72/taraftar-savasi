import { ControlEvent, WebcastEvent } from "tiktok-live-connector";

// tiktok-live-connector 2.5.0'da STREAM_END WebcastEvent altındadır.
// Mevcut sunucu kodunun geriye dönük uyumlu çalışması için alias ekliyoruz.
if (!ControlEvent.STREAM_END && WebcastEvent.STREAM_END) {
  ControlEvent.STREAM_END = WebcastEvent.STREAM_END;
}

await import("./server.js");
