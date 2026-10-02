/** Splits a text stream into lines, carrying partial lines across chunks. */
export class LineSplitter {
  private rest = "";

  push(chunk: string): string[] {
    const parts = (this.rest + chunk).split("\n");
    this.rest = parts.pop() ?? "";
    return parts.map((l) => (l.endsWith("\r") ? l.slice(0, -1) : l));
  }

  /** Whatever is left once the stream ends. */
  flush(): string[] {
    const last = this.rest;
    this.rest = "";
    return last ? [last.endsWith("\r") ? last.slice(0, -1) : last] : [];
  }
}

export type StreamName = "stdout" | "stderr";

/**
 * Docker multiplexes stdout/stderr of non-TTY containers into one stream of
 * frames: an 8-byte header ([type, 0, 0, 0, size as uint32 BE]) then `size`
 * bytes of payload. Frames can be split across chunks, so we buffer.
 */
export function createDemuxer(onFrame: (stream: StreamName, payload: Buffer) => void): (chunk: Buffer) => void {
  let buf: Buffer = Buffer.alloc(0);
  return (chunk: Buffer) => {
    buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
    while (buf.length >= 8) {
      const size = buf.readUInt32BE(4);
      if (buf.length < 8 + size) break;
      const stream: StreamName = buf[0] === 2 ? "stderr" : "stdout";
      onFrame(stream, buf.subarray(8, 8 + size));
      buf = buf.subarray(8 + size);
    }
  };
}

const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\S+Z$/;

/** Docker prefixes each line with an RFC3339 timestamp when `timestamps: true`. */
export function splitTimestamp(line: string): { ts: string | null; text: string } {
  const space = line.indexOf(" ");
  const head = space === -1 ? line : line.slice(0, space);
  if (TIMESTAMP.test(head)) return { ts: head, text: space === -1 ? "" : line.slice(space + 1) };
  return { ts: null, text: line };
}
