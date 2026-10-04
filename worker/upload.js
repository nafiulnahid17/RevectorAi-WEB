/** Streaming multipart filter. Prevents an upload from bypassing priced prepare preflight. */
export function safeUpload(request, maxBytes) {
  const type = request.headers.get("content-type") || "";
  const match = type.match(
    /^multipart\/form-data;\s*boundary=(?:"([A-Za-z0-9'()+_,.\/:=? -]{1,70})"|([A-Za-z0-9'()+_,.\/:=?-]{1,70}))$/i,
  );
  if (!match || !request.body) throw new Error("INVALID_REQUEST");
  const boundary = match[1] || match[2],
    enc = new TextEncoder(),
    dec = new TextDecoder();
  const marker = enc.encode("\r\n--" + boundary),
    start = enc.encode("--" + boundary + "\r\n");
  const index = (bytes, target) => {
    outer: for (let i = 0; i <= bytes.length - target.length; i++) {
      for (let j = 0; j < target.length; j++)
        if (bytes[i + j] !== target[j]) continue outer;
      return i;
    }
    return -1;
  };
  async function* generate() {
    const reader = request.body.getReader();
    let buffer = new Uint8Array(),
      total = 0,
      ended = false;
    async function more() {
      const { done, value } = await reader.read();
      if (done) {
        ended = true;
        return;
      }
      total += value.length;
      if (total > maxBytes) throw new Error("UPLOAD_TOO_LARGE");
      const joined = new Uint8Array(buffer.length + value.length);
      joined.set(buffer);
      joined.set(value, buffer.length);
      buffer = joined;
    }
    async function need(n) {
      while (buffer.length < n && !ended) await more();
      if (buffer.length < n) throw new Error("INVALID_REQUEST");
    }
    try {
      await need(start.length);
      if (index(buffer, start) !== 0) throw new Error("INVALID_REQUEST");
      buffer = buffer.slice(start.length);
      while (true) {
        const sep = enc.encode("\r\n\r\n");
        let end;
        while ((end = index(buffer, sep)) < 0) {
          if (buffer.length > 8192 || ended) throw new Error("INVALID_REQUEST");
          await more();
        }
        if (end > 8192) throw new Error("INVALID_REQUEST");
        const raw = buffer.slice(0, end),
          headers = dec.decode(raw);
        buffer = buffer.slice(end + 4);
        if (/\r\n[ \t]/.test(headers)) throw new Error("INVALID_REQUEST");
        const skip =
          /(?:^|;)\s*name\s*=\s*(?:"auto_prepare"|auto_prepare)(?=;|\r|$)/i.test(
            headers,
          );
        if (skip && /\bfilename=/i.test(headers))
          throw new Error("INVALID_REQUEST");
        if (!skip)
          yield enc.encode("--" + boundary + "\r\n" + headers + "\r\n\r\n");
        let field = 0;
        while (true) {
          const at = index(buffer, marker);
          if (at >= 0) {
            field += at;
            if (skip && field > 8192) throw new Error("INVALID_REQUEST");
            if (!skip) yield buffer.slice(0, at);
            buffer = buffer.slice(at + marker.length);
            break;
          }
          if (ended) throw new Error("INVALID_REQUEST");
          const take = Math.max(0, buffer.length - marker.length - 2);
          if (take) {
            field += take;
            if (skip && field > 8192) throw new Error("INVALID_REQUEST");
            if (!skip) yield buffer.slice(0, take);
            buffer = buffer.slice(take);
          }
          await more();
        }
        await need(2);
        const suffix = dec.decode(buffer.slice(0, 2));
        buffer = buffer.slice(2);
        if (!skip) yield enc.encode("\r\n");
        if (suffix === "--") {
          // Always append a single authoritative field, after stripping every supplied copy.
          yield enc.encode(
            "--" +
              boundary +
              '\r\nContent-Disposition: form-data; name="auto_prepare"\r\n\r\nfalse\r\n--' +
              boundary +
              "--\r\n",
          );
          while (!ended) await more();
          if (
            buffer.length > 2 ||
            (buffer.length && dec.decode(buffer) !== "\r\n")
          )
            throw new Error("INVALID_REQUEST");
          return;
        }
        if (suffix !== "\r\n") throw new Error("INVALID_REQUEST");
      }
    } finally {
      await reader.cancel().catch(() => {});
    }
  }
  const iterator = generate();
  return new ReadableStream({
    async pull(controller) {
      try {
        const { done, value } = await iterator.next();
        if (done) controller.close();
        else controller.enqueue(value);
      } catch (e) {
        controller.error(e);
      }
    },
    async cancel() {
      await iterator.return();
    },
  });
}
