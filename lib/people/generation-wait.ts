export function formatGenerationWait(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  if (safeSeconds < 60) return `${safeSeconds} 秒`;
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = String(safeSeconds % 60).padStart(2, "0");
  return `${minutes} 分 ${seconds} 秒`;
}

export function generationWaitMessage(elapsedSeconds: number) {
  if (elapsedSeconds < 20) return "请求已提交，正在等待生成结果";
  if (elapsedSeconds < 90) return "复杂形象可能需要一些时间，完成后会自动显示";
  return "生成仍在继续，请保持页面打开，完成后会自动显示";
}
