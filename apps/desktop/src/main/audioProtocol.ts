import { pathToFileURL } from "node:url";

import { net, protocol } from "electron";

export const AUDIO_SCHEME = "shengzuo-audio";

export const registerAudioScheme = (): void => {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: AUDIO_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        corsEnabled: true,
        supportFetchAPI: true,
        stream: true,
      },
    },
  ]);
};

export const handleAudioScheme = (
  resolveResultPath: (resultId: string) => string | undefined,
): (() => void) => {
  protocol.handle(AUDIO_SCHEME, (request) => {
    const url = new URL(request.url);
    if (url.hostname !== "result") return new Response(null, { status: 404 });
    const resultId = decodeURIComponent(url.pathname.slice(1));
    if (!/^[a-zA-Z0-9-]{1,120}$/u.test(resultId)) {
      return new Response(null, { status: 400 });
    }
    const filePath = resolveResultPath(resultId);
    if (!filePath) return new Response(null, { status: 404 });
    return net.fetch(pathToFileURL(filePath).toString());
  });
  return () => protocol.unhandle(AUDIO_SCHEME);
};
