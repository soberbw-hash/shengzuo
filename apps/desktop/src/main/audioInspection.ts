export const retryAudioInspection = async <Result>(
  inspect: () => Promise<Result>,
): Promise<Result> => {
  try {
    return await inspect();
  } catch {
    return inspect();
  }
};
