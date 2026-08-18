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
  resolveSamplePath: (
    sampleToken: string,
  ) => string | undefined | Promise<string | undefined>,
): (() => void) => {
  protocol.handle(AUDIO_SCHEME, async (request) => {
    const url = new URL(request.url);
    const identifier = decodeURIComponent(url.pathname.slice(1));
    if (!/^[a-zA-Z0-9-]{1,120}$/u.test(identifier)) {
      return new Response(null, { status: 400 });
    }
    const filePath =
      url.hostname === "result"
        ? resolveResultPath(identifier)
        : url.hostname === "sample" || url.hostname === "voice"
          ? await resolveSamplePath(identifier)
          : undefined;
    if (!filePath) return new Response(null, { status: 404 });
    return net.fetch(pathToFileURL(filePath).toString());
  });
  return () => protocol.unhandle(AUDIO_SCHEME);
};
