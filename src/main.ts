import QRCode from "qrcode";
import { decodeBeam, encodeBeam, parseHoles } from "./beam";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const form = $<HTMLFormElement>("encode");
const canvas = $<HTMLCanvasElement>("qr");
const payloadEl = $("payload");
const decodeInput = $<HTMLTextAreaElement>("decode-input");
const decodeOutput = $("decode-output");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = new FormData(form);
  try {
    const payload = encodeBeam({
      id: String(f.get("id")),
      species: String(f.get("species")),
      length: Number(f.get("length")),
      width: Number(f.get("width")),
      height: Number(f.get("height")),
      holes: parseHoles(String(f.get("holes") ?? "")),
    });
    await QRCode.toCanvas(canvas, payload, { errorCorrectionLevel: "Q", width: 256 });
    payloadEl.textContent = payload;
    payloadEl.className = "";
  } catch (err) {
    payloadEl.textContent = (err as Error).message;
    payloadEl.className = "error";
  }
});

decodeInput.addEventListener("input", () => {
  try {
    decodeOutput.textContent = JSON.stringify(decodeBeam(decodeInput.value), null, 2);
    decodeOutput.className = "";
  } catch (err) {
    decodeOutput.textContent = (err as Error).message;
    decodeOutput.className = "error";
  }
});
